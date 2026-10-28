/**
 * LINKZIVO — Testes de Validação do Algoritmo de Curvas Suaves e Gráficos do Dashboard
 *
 * Valida os cenários obrigatórios:
 * 1. Série vazia
 * 2. Um único ponto
 * 3. Vários pontos (série temporal realista)
 * 4. Série plana (todos 0 e todos com mesmo valor positivo)
 * 5. Pico isolado (sem overshoot / preservação de tendência)
 * 6. Preservação de valores e cálculo de pico
 */

const assert = require("assert");

// Importação dinâmica do chart-utils compilado via tsx
const {
  calculateScale,
  mapSeriesToPoints,
  generateMonotonePath,
} = require("../src/lib/chart-utils.ts");

console.log("================================================================================");
console.log("LINKZIVO — INICIANDO TESTES DO ALGORITMO DE CURVAS E GRÁFICOS DO DASHBOARD");
console.log("================================================================================\n");

let passedAssertions = 0;
function testAssert(condition, message) {
  assert(condition, message);
  passedAssertions++;
  console.log(`  ✅ ${message}`);
}

// -----------------------------------------------------------------------------
// GRUPO 1: Série Vazia
// -----------------------------------------------------------------------------
console.log("--- Grupo 1: Série Vazia ---");
const emptyScale = calculateScale([]);
testAssert(emptyScale.max === 1, "Série vazia calcula escala padrão max = 1");
testAssert(emptyScale.peak === 0, "Série vazia possui pico = 0");
testAssert(emptyScale.isFlat === false, "Série vazia não é classificada como plana positiva");

const emptyPoints = mapSeriesToPoints([], 600, 180, 24, 24);
testAssert(emptyPoints.length === 0, "Mapeamento de série vazia resulta em array vazio");

const emptyPaths = generateMonotonePath(emptyPoints, 156);
testAssert(emptyPaths.linePath === "", "linePath de série vazia é string vazia");
testAssert(emptyPaths.areaPath === "", "areaPath de série vazia é string vazia");

// -----------------------------------------------------------------------------
// GRUPO 2: Um Único Ponto
// -----------------------------------------------------------------------------
console.log("\n--- Grupo 2: Um Único Ponto ---");
const singleVal = [42];
const singleScale = calculateScale(singleVal);
testAssert(singleScale.peak === 42, "Pico de ponto único é 42");
testAssert(singleScale.max > 42, "Escala tem folga (headroom) acima do ponto");

const singlePoints = mapSeriesToPoints(singleVal, 600, 180, 24, 24);
testAssert(singlePoints.length === 1, "Exatamente 1 ponto mapeado");
testAssert(singlePoints[0].x === 300, "Ponto único é posicionado no centro do eixo X (width / 2 = 300)");
testAssert(singlePoints[0].y < 156, "Ponto com valor > 0 fica acima da linha de base (bottomY)");

const singlePaths = generateMonotonePath(singlePoints, 156);
testAssert(singlePaths.linePath.startsWith("M "), "linePath de ponto único inicia com MoveTo M");
testAssert(singlePaths.linePath.includes(" L "), "linePath de ponto único desenha traço horizontal simétrico");
testAssert(singlePaths.areaPath.endsWith(" Z"), "areaPath de ponto único fecha com Z na base");

// -----------------------------------------------------------------------------
// GRUPO 3: Vários Pontos (Série Temporal Realista)
// -----------------------------------------------------------------------------
console.log("\n--- Grupo 3: Vários Pontos (Série Temporal Realista) ---");
const multiData = [10, 25, 18, 45, 60, 35, 80, 50, 65, 40];
const multiScale = calculateScale(multiData);
testAssert(multiScale.peak === 80, "Pico calculado coincide rigorosamente com o maior valor (80)");
testAssert(multiScale.isFlat === false, "Série com variação não é classificada como plana");

const multiPoints = mapSeriesToPoints(multiData, 600, 180, 24, 24, multiScale.max);
testAssert(multiPoints.length === 10, "Mapeia exatamente 10 coordenadas bidimensionais");
testAssert(multiPoints[0].x === 24, "Primeiro ponto inicia exatamente no paddingX (24)");
testAssert(multiPoints[9].x === 600 - 24, "Último ponto termina exatamente em width - paddingX (576)");

const multiPaths = generateMonotonePath(multiPoints, 156);
testAssert(multiPaths.linePath.startsWith("M 24"), "Curva inicia no primeiro ponto");
testAssert(multiPaths.linePath.includes(" C "), "Curva utiliza comandos Bézier cúbicos (C) suaves sem serrilhado");
// Verifica se o caminho contém tantos comandos C quanto (n - 1)
const bezierSegmentsCount = (multiPaths.linePath.match(/ C /g) || []).length;
testAssert(bezierSegmentsCount === 9, "Contém exatamente 9 segmentos cúbicos suaves conectando 10 pontos");
testAssert(multiPaths.areaPath.includes(" L 576.00 156.00 L 24.00 156.00 Z"), "Área em degradê fecha perfeitamente na base do gráfico");

// -----------------------------------------------------------------------------
// GRUPO 4: Série Plana (Valores Repetidos e Ausência de Tráfego)
// -----------------------------------------------------------------------------
console.log("\n--- Grupo 4: Série Plana (Valores Repetidos) ---");
const allZeros = [0, 0, 0, 0, 0, 0, 0];
const zeroScale = calculateScale(allZeros);
testAssert(zeroScale.peak === 0, "Pico de todos zeros é 0");
testAssert(zeroScale.isFlat === true, "Série de zeros identificada");

const zeroPoints = mapSeriesToPoints(allZeros, 600, 180, 24, 24, zeroScale.max);
testAssert(zeroPoints.every((p) => p.y === 156), "Todos os pontos com 0 ficam exatamente na base y = 156");
const zeroPaths = generateMonotonePath(zeroPoints, 156);
testAssert(!zeroPaths.linePath.includes("NaN"), "Caminho de zeros não contém NaN");

const flatPositive = [12, 12, 12, 12, 12];
const flatScale = calculateScale(flatPositive);
testAssert(flatScale.peak === 12, "Pico de série plana é 12");
testAssert(flatScale.isFlat === true, "Série plana positiva identificada");
testAssert(flatScale.max === 12 * 1.6, "Escala para série plana atribui headroom de 1.6x para manter linha visível");

const flatPoints = mapSeriesToPoints(flatPositive, 600, 180, 24, 24, flatScale.max);
testAssert(flatPoints.every((p) => p.y === flatPoints[0].y), "Todos os pontos têm mesma coordenada Y horizontal");
testAssert(flatPoints[0].y > 24 && flatPoints[0].y < 156, "Linha plana fica centralizada na área visível, sem colidir no teto ou base");

const flatPaths = generateMonotonePath(flatPoints, 156);
// Em série plana, todos os slopes e tangentes são 0, logo os pontos de controle ficam no mesmo Y
testAssert(!flatPaths.linePath.includes("NaN"), "Caminho de série plana não contém NaN");
testAssert(flatPaths.areaPath.endsWith(" Z"), "Área da série plana fecha corretamente");

// -----------------------------------------------------------------------------
// GRUPO 5: Pico Isolado (Sem Overshoot)
// -----------------------------------------------------------------------------
console.log("\n--- Grupo 5: Pico Isolado (Sem Overshoot / Monotonicidade) ---");
const isolatedPeak = [0, 0, 100, 0, 0];
const peakScale = calculateScale(isolatedPeak);
testAssert(peakScale.peak === 100, "Pico detectado é 100");

const peakPoints = mapSeriesToPoints(isolatedPeak, 600, 180, 24, 24, peakScale.max);
const peakPt = peakPoints[2];
testAssert(peakPt.y < peakPoints[1].y, "Ponto de pico tem coordenada Y menor (mais alta visualmente)");

const peakPaths = generateMonotonePath(peakPoints, 156);
testAssert(!peakPaths.linePath.includes("NaN"), "Curva de pico isolado não contém NaN");

// Verifica se os pontos de controle em torno do pico respeitam a monotonicidade (sem overshoot acima de peakPt.y)
const segments = peakPaths.linePath.split(" C ");
// O segmento que chega no pico e o segmento que sai do pico
// cp1y e cp2y não podem ser menores do que peakPt.y (que é o topo no sistema de coordenadas SVG invertido)
const coords = peakPaths.linePath.match(/[\d.]+/g).map(Number);
const allYCoords = [];
for (let i = 1; i < coords.length; i += 2) {
  allYCoords.push(coords[i]);
}
const minYInCurve = Math.min(...allYCoords);
testAssert(
  minYInCurve >= peakPt.y - 0.01,
  `Monotonicidade garantida: Y mínimo na curva (${minYInCurve}) não ultrapassa o pico real (${peakPt.y})`
);

// -----------------------------------------------------------------------------
// GRUPO 6: Preservação de Valores dos Indicadores
// -----------------------------------------------------------------------------
console.log("\n--- Grupo 6: Preservação de Valores dos Indicadores ---");
const dailyClicks = [5, 12, 8, 20, 15];
const computedPeak = Math.max(...dailyClicks);
const totalSum = dailyClicks.reduce((a, b) => a + b, 0);

testAssert(computedPeak === 20, "Cálculo de pico permanece estritamente 20");
testAssert(totalSum === 60, "Soma consolidada dos cliques permanece estritamente 60");

const calculatedPeakFromUtil = calculateScale(dailyClicks).peak;
testAssert(calculatedPeakFromUtil === computedPeak, "calculateScale retorna o pico exato da série");

console.log("\n================================================================================");
console.log(`SUÍTE DE TESTES DOS GRÁFICOS CONCLUÍDA: ${passedAssertions} asserções aprovadas com sucesso!`);
console.log("================================================================================\n");
