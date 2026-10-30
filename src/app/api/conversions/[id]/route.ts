import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  sanitizeConversionPayload,
  detectConversionPlatform,
  extractTechnicalProcessingInfo,
} from "@/lib/conversions";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversions/[id]
 * Detalhamento e auditoria individual de uma conversão/postback.
 * 
 * Regras estritas aplicadas:
 * 1. Isolamento multi-tenant na própria consulta ao banco:
 *    where: { id, smartLink: { workspaceId: session.workspaceId } }
 * 2. Sanitização recursiva do rawPayload:
 *    Remove/mascara tokens, secrets, assinaturas e credenciais antes da entrega à UI.
 * 3. Separação explícita entre Estado Financeiro (CONFIRMED, ESTIMATED, REFUNDED)
 *    e Resultado Técnico do Postback (atribuição, integridade, evento original e payload).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);

  if (!session || !session.workspaceId) {
    return NextResponse.json(
      { error: "Não autenticado." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const workspaceId = session.workspaceId;

  // Consulta atômica com filtro simultâneo por ID e por workspaceId do Smart Link relacionado
  const conversion = await db.conversion.findFirst({
    where: {
      id,
      smartLink: {
        workspaceId,
      },
    },
    include: {
      smartLink: {
        select: {
          id: true,
          slug: true,
          title: true,
          destinationUrl: true,
          domain: true,
          createdAt: true,
        },
      },
      campaign: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          platform: true,
          brand: true,
          imageUrl: true,
        },
      },
      offer: {
        select: {
          id: true,
          name: true,
          commissionType: true,
          commissionValue: true,
        },
      },
      click: {
        select: {
          id: true,
          device: true,
          os: true,
          browser: true,
          country: true,
          city: true,
          referer: true,
          isQrScan: true,
          timestamp: true,
        },
      },
    },
  });

  if (!conversion) {
    // Retorna 404 caso não exista ou pertença a outro workspace (prevenção de enumeração IDOR)
    return NextResponse.json(
      { error: "Conversão não encontrada ou acesso não autorizado." },
      { status: 404 }
    );
  }

  // Sanitização estrita do rawPayload
  const sanitizedPayload = sanitizeConversionPayload(conversion.rawPayload);

  // Extração de metadados técnicos de processamento
  const technicalInfo = extractTechnicalProcessingInfo(conversion.rawPayload);
  const platformInfo = detectConversionPlatform(
    conversion.product?.platform,
    conversion.rawPayload
  );

  // Cálculo do tempo de jornada entre o clique e a conversão (se houver clique)
  let attributionTimeSeconds: number | null = null;
  if (conversion.click?.timestamp) {
    attributionTimeSeconds = Math.max(
      0,
      Math.floor(
        (conversion.timestamp.getTime() - conversion.click.timestamp.getTime()) / 1000
      )
    );
  }

  return NextResponse.json({
    conversion: {
      id: conversion.id,
      externalConversionId: conversion.externalConversionId || "N/A",
      conversionType: conversion.conversionType,
      timestamp: conversion.timestamp.toISOString(),

      // Estado Financeiro da Conversão
      financial: {
        status: conversion.status, // CONFIRMED, ESTIMATED, REFUNDED, CANCELED
        amount: conversion.amount,
        commissionAmount: conversion.commissionAmount,
        currency: conversion.currency,
      },

      // Resultado Técnico e Auditoria do Postback
      technicalAudit: {
        platform: platformInfo.platform,
        isPlatformGuaranteed: platformInfo.isGuaranteed,
        attributionModel: conversion.clickId ? "CLICK_ATTRIBUTION (sck)" : "SLUG_FALLBACK",
        attributionTimeSeconds,
        originalEvent: technicalInfo.originalEvent,
        transactionRef: technicalInfo.transactionRef,
        notesOrReason: technicalInfo.notes,
        sanitizedRawPayload: sanitizedPayload,
      },

      // Entidades Relacionadas
      smartLink: conversion.smartLink,
      campaign: conversion.campaign,
      product: conversion.product,
      offer: conversion.offer,
      click: conversion.click,
    },
  });
}
