import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getAnalyticsDateRange } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  const workspaceId = session?.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({
      period: "30d",
      retentionDays: 30,
      effectiveDays: 30,
      totalClicks: 0,
      totalQrScans: 0,
      totalLinks: 0,
      conversionsCount: 0,
      confirmedCommission: 0,
      estimatedCommission: 0,
      totalCommission: 0,
      dailyTimeline: [],
      deviceBreakdown: [],
      osBreakdown: [],
      browserBreakdown: [],
      topCountries: [],
      topCities: [],
      linkPerformance: [],
      campaignPerformance: [],
      productPerformance: [],
      recentClicks: [],
    });
  }

  // Resolução do plano atual do workspace (reflete upgrades/downgrades em tempo real)
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  const currentPlan = workspace?.plan || session.workspacePlan || "FREE";

  const { searchParams } = request.nextUrl;
  const rawPeriod = searchParams.get("period");

  // Cálculo da janela temporal centralizada respeitando o teto de retenção do plano:
  // FREE: máximo 30 dias (qualquer tentativa de pedir > 30d ou 'all' é truncada para 30d).
  // CREATOR: máximo 365 dias.
  const { startDate, maxAllowedDays, effectiveDays, periodLabel } = getAnalyticsDateRange(
    currentPlan,
    rawPeriod
  );

  // 1. Total de links criados pelo workspace (métrica acumulada permanente)
  const totalLinks = await db.smartLink.count({ where: { workspaceId } });

  // 2. Cliques no período especificado e permitido (filtro estrito antes da agregação)
  const clicks = await db.click.findMany({
    where: {
      workspaceId,
      timestamp: { gte: startDate },
    },
    take: 5000,
    orderBy: { timestamp: "desc" },
    include: {
      smartLink: {
        select: {
          id: true,
          slug: true,
          title: true,
          destinationUrl: true,
          campaign: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
        },
      },
    },
  });

  const totalClicks = clicks.length;
  const totalQrScans = clicks.filter((c) => c.isQrScan).length;

  // 3. Conversões no período permitido
  const conversions = await db.conversion.findMany({
    where: {
      smartLink: { workspaceId },
      timestamp: { gte: startDate },
    },
    include: {
      campaign: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
  });

  const conversionsCount = conversions.length;
  const confirmedCommission = conversions
    .filter((c) => c.status === "CONFIRMED")
    .reduce((acc, c) => acc + (Number.isFinite(c.commissionAmount) ? Math.max(0, c.commissionAmount) : 0), 0);
  const estimatedCommission = conversions
    .filter((c) => c.status === "ESTIMATED")
    .reduce((acc, c) => acc + (Number.isFinite(c.commissionAmount) ? Math.max(0, c.commissionAmount) : 0), 0);
  const totalCommission = confirmedCommission + estimatedCommission;

  // 4. Evolução diária (linha do tempo contínua)
  // Monta mapa de dias dos últimos effectiveDays dias (máx 30 pontos no gráfico para clareza visual)
  const timelineMap = new Map<string, { label: string; clicks: number; qrScans: number }>();
  const now = new Date();

  // Gera todas as datas do período em ordem cronológica crescente
  const displayDays = Math.min(effectiveDays, 30);
  for (let i = displayDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const label = `${dd}/${mm}`;
    timelineMap.set(dateKey, { label, clicks: 0, qrScans: 0 });
  }

  // Preenche com os dados reais
  clicks.forEach((c) => {
    const d = new Date(c.timestamp);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const entry = timelineMap.get(dateKey);
    if (entry) {
      entry.clicks += 1;
      if (c.isQrScan) entry.qrScans += 1;
    }
  });

  const dailyTimeline = Array.from(timelineMap.entries()).map(([date, data]) => ({
    date,
    label: data.label,
    clicks: data.clicks,
    qrScans: data.qrScans,
  }));

  // 5. Quebra por Dispositivo, SO e Navegador
  const deviceMap: Record<string, number> = {};
  const osMap: Record<string, number> = {};
  const browserMap: Record<string, number> = {};
  const countryMap: Record<string, number> = {};
  const cityMap: Record<string, number> = {};

  // 6. Agrupamentos por Link, Campanha e Produto
  const linkAggMap: Record<
    string,
    { id: string; slug: string; title: string | null; clicks: number; qrScans: number }
  > = {};
  const campaignAggMap: Record<string, { id: string; name: string; clicks: number }> = {};
  const productAggMap: Record<string, { id: string; name: string; clicks: number }> = {};

  clicks.forEach((c) => {
    // Dispositivo
    const dev = c.device || "Outro";
    deviceMap[dev] = (deviceMap[dev] || 0) + 1;

    // OS
    const osName = c.os || "Outro";
    osMap[osName] = (osMap[osName] || 0) + 1;

    // Browser
    const bName = c.browser || "Outro";
    browserMap[bName] = (browserMap[bName] || 0) + 1;

    // País
    const cCode = c.country || "BR";
    countryMap[cCode] = (countryMap[cCode] || 0) + 1;

    // Cidade
    if (c.city) {
      cityMap[c.city] = (cityMap[c.city] || 0) + 1;
    }

    // Link
    if (c.smartLink) {
      const lId = c.smartLinkId;
      if (!linkAggMap[lId]) {
        linkAggMap[lId] = {
          id: lId,
          slug: c.smartLink.slug,
          title: c.smartLink.title,
          clicks: 0,
          qrScans: 0,
        };
      }
      linkAggMap[lId].clicks += 1;
      if (c.isQrScan) linkAggMap[lId].qrScans += 1;

      // Campanha
      if (c.smartLink.campaign) {
        const camp = c.smartLink.campaign;
        if (!campaignAggMap[camp.id]) {
          campaignAggMap[camp.id] = { id: camp.id, name: camp.name, clicks: 0 };
        }
        campaignAggMap[camp.id].clicks += 1;
      }

      // Produto
      if (c.smartLink.product) {
        const prod = c.smartLink.product;
        if (!productAggMap[prod.id]) {
          productAggMap[prod.id] = { id: prod.id, name: prod.name, clicks: 0 };
        }
        productAggMap[prod.id].clicks += 1;
      }
    }
  });

  const deviceBreakdown = Object.entries(deviceMap).map(([name, count]) => ({
    name,
    count,
    pct: totalClicks ? Math.round((count / totalClicks) * 100) : 0,
  }));

  const osBreakdown = Object.entries(osMap).map(([name, count]) => ({
    name,
    count,
    pct: totalClicks ? Math.round((count / totalClicks) * 100) : 0,
  }));

  const browserBreakdown = Object.entries(browserMap).map(([name, count]) => ({
    name,
    count,
    pct: totalClicks ? Math.round((count / totalClicks) * 100) : 0,
  }));

  const topCountries = Object.entries(countryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([country, count]) => ({ country, count }));

  const topCities = Object.entries(cityMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city, count]) => ({ city, count }));

  const linkPerformance = Object.values(linkAggMap)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  const campaignPerformance = Object.values(campaignAggMap)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  const productPerformance = Object.values(productAggMap)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  return NextResponse.json({
    period: periodLabel,
    retentionDays: maxAllowedDays,
    effectiveDays,
    totalClicks,
    totalQrScans,
    totalLinks,
    conversionsCount,
    confirmedCommission,
    estimatedCommission,
    totalCommission,
    dailyTimeline,
    deviceBreakdown,
    osBreakdown,
    browserBreakdown,
    topCountries,
    topCities,
    linkPerformance,
    campaignPerformance,
    productPerformance,
    recentClicks: clicks.slice(0, 10).map((c) => ({
      id: c.id,
      slug: c.smartLink?.slug || "",
      title: c.smartLink?.title || null,
      device: c.device,
      os: c.os,
      browser: c.browser,
      country: c.country,
      isQrScan: c.isQrScan,
      timestamp: c.timestamp,
    })),
  });
}
