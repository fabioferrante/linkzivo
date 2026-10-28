/**
 * LINKZIVO — Utilitários de Curvas Matemáticas e Interpolação para Gráficos SVG
 *
 * Implementa spline cúbica monotônica (algoritmo Fritsch-Carlson) para geração
 * de curvas suaves e contínuas que passam rigorosamente pelos pontos reais,
 * eliminando serrilhado e quinas angulosas sem produzir overshoot (picos falsos)
 * e garantindo monotonicidade local e estabilidade em séries planas ou de ponto único.
 */

export interface Point {
  x: number;
  y: number;
}

export interface MonotonePathResult {
  linePath: string;
  areaPath: string;
}

export interface ScaleResult {
  max: number;
  isFlat: boolean;
  peak: number;
}

/**
 * Calcula a escala vertical com folga (headroom) adequada para que a curva respire
 * e garante que séries planas não fiquem coladas na base ou no topo.
 */
export function calculateScale(values: number[], minHeadroom = 1.15): ScaleResult {
  if (!values || values.length === 0) {
    return { max: 1, isFlat: false, peak: 0 };
  }

  const cleanValues = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const peak = Math.max(...cleanValues, 0);

  if (peak === 0) {
    return { max: 1, isFlat: true, peak: 0 };
  }

  const minVal = Math.min(...cleanValues);
  const isFlat = cleanValues.length > 1 && minVal === peak;

  // Em séries planas positivas (ex: todos os dias com 5 cliques),
  // ajustamos a escala para que a linha fique elegante e centralizada (~62.5% da altura)
  const max = isFlat ? peak * 1.6 : Math.max(peak * minHeadroom, 4);

  return { max, isFlat, peak };
}

/**
 * Mapeia uma lista de números em coordenadas bidimensionais (Point) em um espaço SVG.
 */
export function mapSeriesToPoints(
  data: number[],
  width: number,
  height: number,
  paddingX: number,
  paddingY: number,
  customScaleMax?: number
): Point[] {
  if (!data || data.length === 0) {
    return [];
  }

  const bottomY = height - paddingY;
  const usableWidth = width - paddingX * 2;
  const usableHeight = bottomY - paddingY;
  const scaleMax = customScaleMax || calculateScale(data).max;

  return data.map((val, idx) => {
    let x: number;
    if (data.length === 1) {
      x = width / 2;
    } else {
      x = paddingX + (idx / (data.length - 1)) * usableWidth;
    }

    const cleanVal = Number.isFinite(val) && val > 0 ? val : 0;
    const y = bottomY - (cleanVal / scaleMax) * usableHeight;

    return {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  });
}

/**
 * Gera os caminhos SVG `linePath` e `areaPath` usando interpolação Fritsch-Carlson
 * cúbica monotônica. Elimina segmentos serrilhados e preserva todos os pontos reais.
 */
export function generateMonotonePath(points: Point[], bottomY: number): MonotonePathResult {
  const n = points.length;
  if (n === 0) {
    return { linePath: "", areaPath: "" };
  }

  if (n === 1) {
    const pt = points[0];
    const span = 15;
    const x0 = Math.max(0, pt.x - span);
    const x1 = pt.x + span;
    const linePath = `M ${x0.toFixed(2)} ${pt.y.toFixed(2)} L ${x1.toFixed(2)} ${pt.y.toFixed(2)}`;
    const areaPath = `M ${x0.toFixed(2)} ${pt.y.toFixed(2)} L ${x1.toFixed(2)} ${pt.y.toFixed(2)} L ${x1.toFixed(2)} ${bottomY.toFixed(2)} L ${x0.toFixed(2)} ${bottomY.toFixed(2)} Z`;
    return { linePath, areaPath };
  }

  if (n === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const linePath = `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
    const areaPath = `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p1.x.toFixed(2)} ${bottomY.toFixed(2)} L ${p0.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
    return { linePath, areaPath };
  }

  // 1. Slopes secantes
  const dxs: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    dxs.push(dx);
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  // 2. Tangentes nos nós com média harmônica de Fritsch-Carlson
  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];

  for (let i = 1; i < n - 1; i++) {
    const m0 = slopes[i - 1];
    const m1 = slopes[i];
    // Se muda de sentido ou atinge patamar plano, a derivada no nó deve ser zero
    if (m0 * m1 <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (2 * m0 * m1) / (m0 + m1);
    }
  }

  // 3. Montagem dos segmentos cúbicos de Bézier (C cp1x cp1y, cp2x cp2y, x y)
  let linePath = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = dxs[i];
    const oneThird = dx / 3;

    const cp1x = p0.x + oneThird;
    const cp1y = p0.y + (tangents[i] * dx) / 3;
    const cp2x = p1.x - oneThird;
    const cp2y = p1.y - (tangents[i + 1] * dx) / 3;

    linePath += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }

  const firstPt = points[0];
  const lastPt = points[n - 1];
  const areaPath = `${linePath} L ${lastPt.x.toFixed(2)} ${bottomY.toFixed(2)} L ${firstPt.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;

  return { linePath, areaPath };
}
