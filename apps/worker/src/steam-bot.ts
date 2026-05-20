import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import SteamTotp from 'steam-totp';
import pino from 'pino';
import { env } from './env.js';

const log = pino({ name: 'steam-bot' });

export interface BotConfig {
  username: string;
  password: string;
  sharedSecret: string;
  identitySecret: string;
}

export interface BotHandles {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  community: any;
  manager: TradeOfferManager;
  steamId64: string;
}

let cached: Promise<BotHandles> | null = null;

const config = (): BotConfig | null => {
  if (
    !env.STEAM_BOT_USERNAME ||
    !env.STEAM_BOT_PASSWORD ||
    !env.STEAM_BOT_SHARED_SECRET ||
    !env.STEAM_BOT_IDENTITY_SECRET
  ) {
    return null;
  }
  return {
    username: env.STEAM_BOT_USERNAME,
    password: env.STEAM_BOT_PASSWORD,
    sharedSecret: env.STEAM_BOT_SHARED_SECRET,
    identitySecret: env.STEAM_BOT_IDENTITY_SECRET,
  };
};

export const getBot = async (): Promise<BotHandles | null> => {
  const cfg = config();
  if (!cfg) {
    log.warn('Steam bot env not configured — skipping bot init');
    return null;
  }
  if (cached) return cached;
  cached = init(cfg);
  return cached;
};

const init = (cfg: BotConfig): Promise<BotHandles> => {
  const client = new SteamUser();
  const community = new SteamCommunity();
  const manager = new TradeOfferManager({
    steam: client,
    community,
    language: 'en',
    cancelTime: 1000 * 60 * 60 * 2,
  });

  return new Promise<BotHandles>((resolve, reject) => {
    client.on('error', (err: Error) => log.error({ err }, 'steam client error'));

    client.on('loggedOn', () => {
      log.info({ steamId: client.steamID?.toString() }, 'bot logged into Steam');
      client.setPersona(SteamUser.EPersonaState.Online);
      client.gamesPlayed([252490]);
    });

    client.on('webSession', (_sessionId: string, cookies: string[]) => {
      manager.setCookies(cookies, (err: Error | null) => {
        if (err) {
          log.error({ err }, 'failed to set TradeOfferManager cookies');
          reject(err);
          return;
        }
        community.setCookies(cookies);
        community.startConfirmationChecker(20_000, cfg.identitySecret);
        const sid = client.steamID?.toString();
        if (!sid) {
          reject(new Error('no steamID after webSession'));
          return;
        }
        log.info('bot ready for trades');
        resolve({ client, community, manager, steamId64: sid });
      });
    });

    client.logOn({
      accountName: cfg.username,
      password: cfg.password,
      twoFactorCode: SteamTotp.generateAuthCode(cfg.sharedSecret),
    });
  });
};
