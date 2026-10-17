const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSlugYtb() {
  const cleanSlug = "ytb";
  console.log("Testando busca para slug:", cleanSlug);
  
  const existing = await prisma.smartLink.findUnique({
    where: { slug: cleanSlug }
  });
  console.log("findUnique result:", existing);

  const existingInsensitive = await prisma.smartLink.findFirst({
    where: { slug: { equals: cleanSlug, mode: 'insensitive' } }
  });
  console.log("findFirst insensitive result:", existingInsensitive);

  await prisma.$disconnect();
}

testSlugYtb().catch(console.error);
