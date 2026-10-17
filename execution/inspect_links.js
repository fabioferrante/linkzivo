const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const links = await prisma.smartLink.findMany();
  console.log('Total de links encontrados:', links.length);
  for (const l of links) {
    console.log(`- ID: ${l.id} | Slug: "${l.slug}" | Status: ${l.status} | URL: ${l.destinationUrl}`);
  }

  const ytb = await prisma.smartLink.findUnique({
    where: { slug: 'ytb' },
  });
  console.log('Busca findUnique ytb:', ytb);

  const ytbInsensitive = await prisma.smartLink.findMany({
    where: { slug: { equals: 'ytb', mode: 'insensitive' } }
  });
  console.log('Busca insensitive ytb:', ytbInsensitive);

  await prisma.$disconnect();
}

main().catch(console.error);
