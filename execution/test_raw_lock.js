const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function test() {
  const link = await prisma.smartLink.findFirst();
  if (!link) {
    console.log("Nenhum link encontrado");
    return;
  }
  const testId = "test-atomic-lock-" + Date.now();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + 3000);

  // 1. Primeira tentativa: deve inserir e retornar 1 linha
  const res1 = await prisma.$queryRaw`
    INSERT INTO "QrScanLock" ("id", "smartLinkId", "clickId", "lockedUntil", "createdAt")
    VALUES (${testId}, ${link.id}, 'click-1', ${lockedUntil}, NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "clickId" = EXCLUDED."clickId",
        "lockedUntil" = EXCLUDED."lockedUntil"
    WHERE "QrScanLock"."lockedUntil" < NOW()
    RETURNING "id";
  `;
  console.log("Tentativa 1 (novo lock):", res1);

  // 2. Segunda tentativa imediata: lockedUntil ainda no futuro, deve retornar []
  const res2 = await prisma.$queryRaw`
    INSERT INTO "QrScanLock" ("id", "smartLinkId", "clickId", "lockedUntil", "createdAt")
    VALUES (${testId}, ${link.id}, 'click-2', ${lockedUntil}, NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "clickId" = EXCLUDED."clickId",
        "lockedUntil" = EXCLUDED."lockedUntil"
    WHERE "QrScanLock"."lockedUntil" < NOW()
    RETURNING "id";
  `;
  console.log("Tentativa 2 (lock ativo, deve ser vazio):", res2);

  // 3. Simula expiração: altera lockedUntil para o passado
  await prisma.$executeRaw`
    UPDATE "QrScanLock"
    SET "lockedUntil" = NOW() - INTERVAL '5 seconds'
    WHERE "id" = ${testId};
  `;

  // 4. Terceira tentativa: lock expirado, deve atualizar e retornar 1 linha
  const res3 = await prisma.$queryRaw`
    INSERT INTO "QrScanLock" ("id", "smartLinkId", "clickId", "lockedUntil", "createdAt")
    VALUES (${testId}, ${link.id}, 'click-3', ${new Date(Date.now() + 3000)}, NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "clickId" = EXCLUDED."clickId",
        "lockedUntil" = EXCLUDED."lockedUntil"
    WHERE "QrScanLock"."lockedUntil" < NOW()
    RETURNING "id";
  `;
  console.log("Tentativa 3 (lock expirado assumido):", res3);

  // Limpeza
  await prisma.qrScanLock.deleteMany({ where: { id: testId } });
  await prisma.$disconnect();
}

test().catch(console.error);
