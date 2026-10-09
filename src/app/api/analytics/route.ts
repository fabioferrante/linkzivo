import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const workspaceId = session?.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({
      totalClicks: 0,
      totalQrScans: 0,
      totalLinks: 0,
      conversionsCount: 0,
      estimatedCommission: 0,
      deviceBreakdown: [],
      osBreakdown: [],
      topCountries: [],
      recentClicks: [],
    });
  }

  // Estatísticas agregadas
  const totalLinks = await db.smartLink.count({ where: { workspaceId } });

  const clicks = await db.click.findMany({
    where: { workspaceId },
    take: 1000,
    orderBy: { timestamp: "desc" },
    include: {
      smartLink: { select: { slug: true, title: true, destinationUrl: true } },
    },
  });

  const totalClicks = clicks.length;
  const totalQrScans = clicks.filter((c) => c.isQrScan).length;

  // Conversões
  const conversions = await db.conversion.findMany({
    where: { smartLink: { workspaceId } },
  });
  const conversionsCount = conversions.length;
  const estimatedCommission = conversions.reduce((acc, c) => acc + c.commissionAmount, 0);

  // Quebra por Dispositivo
  const deviceMap: Record<string, number> = {};
  const osMap: Record<string, number> = {};
  const countryMap: Record<string, number> = {};

  clicks.forEach((c) => {
    const dev = c.device || "Outro";
    deviceMap[dev] = (deviceMap[dev] || 0) + 1;

    const osName = c.os || "Outro";
    osMap[osName] = (osMap[osName] || 0) + 1;

    const cCode = c.country || "BR";
    countryMap[cCode] = (countryMap[cCode] || 0) + 1;
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

  const topCountries = Object.entries(countryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([country, count]) => ({ country, count }));

  return NextResponse.json({
    totalClicks,
    totalQrScans,
    totalLinks,
    conversionsCount,
    estimatedCommission,
    deviceBreakdown,
    osBreakdown,
    topCountries,
    recentClicks: clicks.slice(0, 10).map((c) => ({
      id: c.id,
      slug: c.smartLink.slug,
      title: c.smartLink.title,
      device: c.device,
      os: c.os,
      browser: c.browser,
      country: c.country,
      isQrScan: c.isQrScan,
      timestamp: c.timestamp,
    })),
  });
}
