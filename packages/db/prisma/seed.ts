/**
 * Dev seed — runs via `pnpm --filter @rustskinpay/db db:seed` after migrations.
 *
 * Inserts:
 *   - One internal Merchant (used for all Phase 1 marketplace orders).
 *   - One demo seller User with a fake Steam ID.
 *   - A handful of sample Rust SteamItems + matching InventoryItems + Listings.
 *
 * Safe to re-run (uses upserts keyed by stable unique identifiers).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const adapter = new PrismaPg({
  connectionString: url,
  max: 5,
  keepAlive: true,
  keepAliveInitialDelayMillis: 1000,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 30000,
});
const prisma = new PrismaClient({ adapter });

const RUST_APP_ID = 252490;

const SAMPLE_ITEMS = [
  {
    classId: '900001',
    marketHashName: 'Tempered AK47',
    displayName: 'Tempered AK47',
    type: 'Weapon',
    rarity: 'Rare',
    iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVl4',
    priceMinor: 2499,
  },
  {
    classId: '900002',
    marketHashName: 'Whiteout Hoodie',
    displayName: 'Whiteout Hoodie',
    type: 'Clothing',
    rarity: 'Common',
    iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVl4',
    priceMinor: 599,
  },
  {
    classId: '900003',
    marketHashName: 'Glowing Eyes',
    displayName: 'Glowing Eyes',
    type: 'Face Mask',
    rarity: 'Epic',
    iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVl4',
    priceMinor: 12999,
  },
  {
    classId: '900004',
    marketHashName: 'Forest Camo Bandana',
    displayName: 'Forest Camo Bandana',
    type: 'Bandana',
    rarity: 'Uncommon',
    iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVl4',
    priceMinor: 349,
  },
  {
    classId: '900005',
    marketHashName: 'Blackout Door',
    displayName: 'Blackout Door',
    type: 'Door',
    rarity: 'Rare',
    iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVl4',
    priceMinor: 1849,
  },
  {
    classId: '900006',
    marketHashName: 'Wasteland Metal Chestplate',
    displayName: 'Wasteland Metal Chestplate',
    type: 'Armor',
    rarity: 'Epic',
    iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVl4',
    priceMinor: 8499,
  },
];

const DEMO_SELLER_STEAMID = '76561198000000001';

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { id: 'internal-merchant' },
    create: {
      id: 'internal-merchant',
      name: 'RustSkinPay Marketplace',
      isInternal: true,
      status: 'ACTIVE',
      settlementCurrency: 'USD',
    },
    update: {},
  });
  console.log(`Merchant ready: ${merchant.id}`);

  const seller = await prisma.user.upsert({
    where: { steamId64: DEMO_SELLER_STEAMID },
    create: {
      steamId64: DEMO_SELLER_STEAMID,
      displayName: 'DemoSeller',
      avatarUrl: null,
    },
    update: {},
  });
  console.log(`Seller ready: ${seller.id}`);

  for (const sample of SAMPLE_ITEMS) {
    const steamItem = await prisma.steamItem.upsert({
      where: {
        appId_classId_instanceId: {
          appId: RUST_APP_ID,
          classId: sample.classId,
          instanceId: '0',
        },
      },
      create: {
        appId: RUST_APP_ID,
        classId: sample.classId,
        instanceId: '0',
        marketHashName: sample.marketHashName,
        displayName: sample.displayName,
        iconUrl: sample.iconUrl,
        type: sample.type,
        rarity: sample.rarity,
        marketable: true,
        tradable: true,
      },
      update: {},
    });

    const fakeAssetId = `seed_${sample.classId}`;
    const inv = await prisma.inventoryItem.upsert({
      where: {
        userId_assetId: { userId: seller.id, assetId: fakeAssetId },
      },
      create: {
        userId: seller.id,
        steamItemId: steamItem.id,
        assetId: fakeAssetId,
        tradable: true,
      },
      update: {},
    });

    const existing = await prisma.listing.findUnique({
      where: { inventoryItemId: inv.id },
    });
    if (!existing) {
      await prisma.listing.create({
        data: {
          sellerId: seller.id,
          inventoryItemId: inv.id,
          steamItemId: steamItem.id,
          priceMinor: sample.priceMinor,
          currency: 'USD',
          status: 'ACTIVE',
        },
      });
    }
    console.log(`Listing for ${sample.displayName} ready`);
  }

  console.log('seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
