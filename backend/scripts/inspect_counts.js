const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.fireObservation.count();
  const bySensor = await prisma.fireObservation.groupBy({
    by: ['sensor'],
    _count: { id: true },
  });
  const byPlatform = await prisma.fireObservation.groupBy({
    by: ['satellitePlatform'],
    _count: { id: true },
  });
  const latest = await prisma.fireObservation.findFirst({
    orderBy: { observationTime: 'desc' },
    select: { observationTime: true, satellitePlatform: true, sensor: true },
  });
  const earliest = await prisma.fireObservation.findFirst({
    orderBy: { observationTime: 'asc' },
    select: { observationTime: true, satellitePlatform: true, sensor: true },
  });

  console.log('TOTAL:', total);
  console.log('BY_SENSOR:', JSON.stringify(bySensor, null, 2));
  console.log('BY_PLATFORM:', JSON.stringify(byPlatform, null, 2));
  console.log('LATEST:', latest);
  console.log('EARLIEST:', earliest);
}

main().catch(console.error).finally(() => prisma.$disconnect());

