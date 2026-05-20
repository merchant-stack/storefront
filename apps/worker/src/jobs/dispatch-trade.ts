import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { getBot } from '../steam-bot.js';
import { RUST_APP_ID, RUST_CONTEXT_ID } from '../constants.js';
import type { TradeDispatchJob } from '../queue.js';

const log = pino({ name: 'dispatch-trade' });

interface BotInventoryItem {
  appid: number;
  contextid: string | number;
  assetid: string;
  market_hash_name: string;
}

/**
 * Process a single trade dispatch job.
 *
 * Looks up the Trade + its associated Order + items, locates the matching
 * assets in the bot's inventory by market_hash_name, builds a trade offer
 * for the buyer, sends it, and confirms via the bot's mobile authenticator.
 *
 * Updates the Trade row's status throughout.
 */
export const dispatchTrade = async (job: Job<TradeDispatchJob>): Promise<void> => {
  const { tradeId } = job.data;

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      order: {
        include: {
          items: {
            include: {
              listing: { include: { steamItem: true } },
              sourceItem: true,
            },
          },
        },
      },
    },
  });
  if (!trade) {
    log.warn({ tradeId }, 'trade not found');
    return;
  }

  const bot = await getBot();
  if (!bot) {
    await prisma.trade.update({
      where: { id: tradeId },
      data: { status: 'FAILED', errorCode: 'BOT_NOT_CONFIGURED' },
    });
    throw new Error('Steam bot not configured');
  }

  await prisma.trade.update({
    where: { id: tradeId },
    data: { status: 'SENDING', attemptCount: { increment: 1 } },
  });

  const offer = bot.manager.createOffer(trade.buyerTradeUrl);

  // The @types declaration for getInventoryContents uses the full CEconItem
  // shape, but we only need a few fields for item matching. Cast through unknown
  // and treat each entry as the minimal subset we use.
  const inventory = await new Promise<BotInventoryItem[]>((resolve, reject) => {
    bot.manager.getInventoryContents(
      RUST_APP_ID,
      Number(RUST_CONTEXT_ID),
      true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: Error | null, items: any) => {
        if (err) reject(err);
        else resolve(items as BotInventoryItem[]);
      },
    );
  });

  const used = new Set<string>();
  for (const orderItem of trade.order.items) {
    const wantedName =
      orderItem.sourceItem?.marketHashName ??
      orderItem.listing?.steamItem.marketHashName ??
      orderItem.itemName;
    const match = inventory.find(
      (i) => i.market_hash_name === wantedName && !used.has(String(i.assetid)),
    );
    if (!match) {
      await prisma.trade.update({
        where: { id: tradeId },
        data: {
          status: 'FAILED',
          errorCode: 'ITEM_NOT_IN_BOT_INVENTORY',
          errorMessage: `bot lacks ${wantedName}`,
        },
      });
      return;
    }
    used.add(String(match.assetid));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    offer.addMyItem(match as any);
  }

  offer.setMessage(`Order ${trade.orderId} — thanks for using RustSkinPay`);

  const sendResult = await new Promise<{ status: string; offerId: string | null }>((resolve) => {
    offer.send((err: Error | null, status: string) => {
      if (err) {
        log.error({ err, tradeId }, 'offer send failed');
        resolve({ status: 'error', offerId: null });
        return;
      }
      resolve({ status, offerId: offer.id ?? null });
    });
  });

  if (!sendResult.offerId) {
    await prisma.trade.update({
      where: { id: tradeId },
      data: { status: 'FAILED', errorCode: 'SEND_FAILED' },
    });
    return;
  }

  await prisma.trade.update({
    where: { id: tradeId },
    data: {
      status: 'SENT',
      tradeOfferId: sendResult.offerId,
      sentAt: new Date(),
    },
  });

  log.info(
    { tradeId, offerId: sendResult.offerId, status: sendResult.status },
    'trade offer sent',
  );
};
