const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const PROD_CONN = "postgresql://postgres:aYAOqCRnkXPxsyaZHhUyBxYPygriurVX@kodama.proxy.rlwy.net:29302/railway";

async function backup() {
  console.log("=== INICIANDO SNAPSHOT DE SEGURANÇA DO BANCO DE PRODUÇÃO ===");
  console.log("Alvo: PostgreSQL (linkzivo / production)");

  const prisma = new PrismaClient({
    datasources: {
      db: { url: PROD_CONN },
    },
  });

  try {
    await prisma.$connect();
    console.log("Conectado com sucesso ao PostgreSQL de produção!");

    // Buscar tabelas existentes via raw SQL
    const tablesRes = await prisma.$queryRaw`
      SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';
    `;
    console.log("Tabelas encontradas:", tablesRes.map((t) => t.tablename));

    const snapshot = {
      timestamp: new Date().toISOString(),
      database: "railway",
      environment: "production",
      tables: {},
    };

    for (const { tablename } of tablesRes) {
      if (tablename.startsWith("_prisma")) continue;
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${tablename}";`);
      snapshot.tables[tablename] = rows;
      console.log(`- Tabela "${tablename}": ${rows.length} registros exportados`);
    }

    const tmpDir = path.join(__dirname, "..", ".tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const destPath = path.join(tmpDir, "production_backup_before_reset.json");
    fs.writeFileSync(destPath, JSON.stringify(snapshot, null, 2), "utf8");

    console.log(`\n✓ Snapshot de segurança salvo com sucesso em: ${destPath}`);
    console.log(`Tamanho do arquivo: ${fs.statSync(destPath).size} bytes`);
  } catch (err) {
    console.error("Erro durante o snapshot:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backup();
