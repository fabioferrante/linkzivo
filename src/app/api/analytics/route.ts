import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const workspaceId = session?.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({
      period: "30d",
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

  const { searchParams } = request.nextUrl;
  const period = searchParams.get("period") || "30d";

  // Cálculo da janela temporal
  let startDate: Date | undefined = undefined;
  let daysCount = 30;

  if (period === "7d") {
    daysCount = 7;
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "90d") {
    daysCount = 90;
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  } else if (period === "all") {
    daysCount = 30; // exibe os últimos 30 dias na linha do tempo diária
    startDate = undefined;
  } else {
    // padrão 30d
    daysCount = 30;
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  // 1. Total de links criados pelo workspace (permanente)
  const totalLinks = await db.smartLink.count({ where: { workspaceId } });

  // 2. Cliques no período especificado
  const clicks = await db.click.findMany({
    where: {
      workspaceId,
      ...(startDate ? { timestamp: { gte: startDate } } : {}),
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

  // 3. Conversões no período
  const conversions = await db.conversion.findMany({
    where: {
      smartLink: { workspaceId },
      ...(startDate ? { timestamp: { gte: startDate } } : {}),
    },
    include: {
      campaign: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
  });

  const conversionsCount = conversions.length;
  const confirmedCommission = conversions
    .filter((c) => c.status === "CONFIRMED")
    .reduce((acc, c) => acc + c.commissionAmount, 0);
  const estimatedCommission = conversions
    .filter((c) => c.status === "ESTIMATED")
    .reduce((acc, c) => acc + c.commissionAmount, 0);
  const totalCommission = confirmedCommission + estimatedCommission;

  // 4. Evolução diária (linha do tempo contínua)
  // Monta mapa de dias dos últimos daysCount dias
  const timelineMap = new Map<string, { label: string; clicks: number; qrScans: number }>();
  const now = new Date();

  // Gera todas as datas do período em ordem cronológica crescente
  const displayDays = Math.min(daysCount, 30); // máx 30 pontos no gráfico para clareza visual
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
    period,
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
