// Steam bot smoke test — proves login + 2FA + auto-confirm + send-offer work
// end-to-end with a real Steam account. Does NOT need the worker's full env
// (no DB / no Redis required). Reads bot credentials from a .maFile path
// + prompts for password interactively.
//
// Run:
//   $env:STEAM_BOT_MAFILE = "S:\Projects\skinpay\vietzodunyas27.maFile"
//   $env:STEAM_BUYER_TRADE_URL = "https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
//   pnpm --filter @rustskinpay/worker exec tsx src/scripts/steam-bot-smoke.ts
//
// PowerShell will prompt for the Steam password (Read-Host -AsSecureString
// equivalent inside the script via readline).
//
// What it does:
//   1. Reads shared_secret + identity_secret + account_name from .maFile
//   2. Prompts for Steam password (hidden input)
//   3. Logs into Steam (with TOTP code from shared_secret)
//   4. Lists Rust inventory items
//   5. If --send flag passed: sends the FIRST inventory item to the
//      STEAM_BUYER_TRADE_URL and waits ~30s for community confirmation
//
// Default mode is INVENTORY-ONLY (read-only). Pass `--send` to actually
// send an item — only do this when you're ready to part with one.
import { readFile } from 'node:fs/promises';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import SteamTotp from 'steam-totp';

const RUST_APP_ID = 252490;
const RUST_CONTEXT_ID = 2;

interface MaFile {
  shared_secret: string;
  identity_secret: string;
  account_name: string;
}

interface BotInventoryItem {
  appid: number;
  contextid: string | number;
  assetid: string;
  market_hash_name: string;
}

async function readMaFile(path: string): Promise<MaFile> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as Partial<MaFile>;
  if (!parsed.shared_secret || !parsed.identity_secret || !parsed.account_name) {
    throw new Error(`.maFile missing required fields (shared_secret / identity_secret / account_name)`);
  }
  return {
    shared_secret: parsed.shared_secret,
    identity_secret: parsed.identity_secret,
    account_name: parsed.account_name,
  };
}

// Prompt for a hidden secret in the terminal (e.g. Steam password). The
// characters typed by the user are NOT echoed back to the terminal. Works in
// Windows PowerShell + Unix terminals.
async function promptHidden(question: string): Promise<string> {
  const mutableStdout = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mutableStdout as any).muted = false;
  const rl = readline.createInterface({
    input: process.stdin,
    output: mutableStdout,
    terminal: true,
  });
  process.stdout.write(question);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mutableStdout as any).muted = true;
  return new Promise<string>((resolve) => {
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const maFilePath = process.env.STEAM_BOT_MAFILE;
  if (!maFilePath) {
    console.error('Missing STEAM_BOT_MAFILE env var. Set it to your .maFile path, e.g.');
    console.error('  $env:STEAM_BOT_MAFILE = "S:\\Projects\\skinpay\\vietzodunyas27.maFile"');
    process.exit(2);
  }

  const wantsSend = process.argv.includes('--send');
  const tradeUrl = process.env.STEAM_BUYER_TRADE_URL;
  if (wantsSend && !tradeUrl) {
    console.error('--send requested but STEAM_BUYER_TRADE_URL is not set.');
    process.exit(2);
  }

  const ma = await readMaFile(maFilePath);
  console.log(`Loaded .maFile for account: ${ma.account_name}`);
  const password = await promptHidden(`Steam password for ${ma.account_name}: `);
  if (!password) {
    console.error('Empty password — aborting.');
    process.exit(2);
  }

  const client = new SteamUser();
  const community = new SteamCommunity();
  const manager = new TradeOfferManager({
    steam: client,
    community,
    language: 'en',
  });

  let resolveReady: (() => void) | null = null;
  const ready = new Promise<void>((res) => {
    resolveReady = res;
  });

  client.on('error', (err: Error) => {
    console.error('Steam client error:', err.message);
    process.exit(1);
  });

  client.on('steamGuard', (domain: string | null, callback: (code: string) => void) => {
    if (domain) {
      // Email confirmation required. We can't do this from the script —
      // the user needs to check their email and re-run.
      console.error(`Steam Guard EMAIL code required (sent to: ${domain}). Re-run after confirming login from email.`);
      process.exit(1);
    }
    // App-based 2FA — generate from shared_secret.
    const code = SteamTotp.generateAuthCode(ma.shared_secret);
    console.log(`Submitting 2FA code from shared_secret: ${code}`);
    callback(code);
  });

  client.on('loggedOn', () => {
    console.log(`Logged into Steam as ${client.steamID?.toString()}`);
    client.setPersona(SteamUser.EPersonaState.Online);
  });

  client.on('webSession', (_sessionId: string, cookies: string[]) => {
    manager.setCookies(cookies, (err: Error | null) => {
      if (err) {
        console.error('TradeOfferManager.setCookies failed:', err.message);
        process.exit(1);
      }
      community.setCookies(cookies);
      // Poll for outgoing-trade confirmations every 20s.
      community.startConfirmationChecker(20_000, ma.identity_secret);
      console.log('Web session established; bot ready for trades.');
      resolveReady?.();
    });
  });

  client.logOn({
    accountName: ma.account_name,
    password,
    twoFactorCode: SteamTotp.generateAuthCode(ma.shared_secret),
  });

  await ready;

  // 1. List inventory.
  console.log('\n--- bot inventory (Rust, appid=252490) ---');
  const inventory = await new Promise<BotInventoryItem[]>((resolve, reject) => {
    manager.getInventoryContents(
      RUST_APP_ID,
      RUST_CONTEXT_ID,
      true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: Error | null, items: any) => {
        if (err) reject(err);
        else resolve(items as BotInventoryItem[]);
      },
    );
  });
  console.log(`Found ${inventory.length} Rust item(s).`);
  for (const item of inventory.slice(0, 10)) {
    console.log(`  assetid=${item.assetid}  ${item.market_hash_name}`);
  }
  if (inventory.length > 10) console.log(`  ...and ${inventory.length - 10} more`);

  if (!wantsSend) {
    console.log('\nRead-only mode — exiting. Pass --send to actually send an item.');
    client.logOff();
    process.exit(0);
  }

  // 2. Send the first item to the trade URL.
  const target = inventory[0];
  if (!target) {
    console.error('Inventory empty — nothing to send. Aborting.');
    client.logOff();
    process.exit(1);
  }

  console.log(`\n--- sending: ${target.market_hash_name} (assetid=${target.assetid}) ---`);
  const offer = manager.createOffer(tradeUrl!);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer.addMyItem(target as any);
  offer.setMessage('Steam bot smoke test from RustSupply worker');

  const sendResult = await new Promise<{ status: string; offerId: string | null }>((resolve) => {
    offer.send((err: Error | null, status: string) => {
      if (err) {
        console.error('offer.send failed:', err.message);
        resolve({ status: 'error', offerId: null });
        return;
      }
      resolve({ status, offerId: offer.id ?? null });
    });
  });

  if (!sendResult.offerId) {
    console.error('Offer send failed — see error above.');
    client.logOff();
    process.exit(1);
  }
  console.log(`Offer sent! offerId=${sendResult.offerId} status=${sendResult.status}`);
  console.log('Waiting up to 45s for community confirmation checker to auto-confirm...');

  // Wait for community.startConfirmationChecker to do its thing.
  await new Promise((r) => setTimeout(r, 45_000));

  console.log('\nDone. Open Steam on your buyer device — the offer should be waiting in your inbox.');
  console.log(`Offer URL: https://steamcommunity.com/tradeoffer/${sendResult.offerId}/`);
  client.logOff();
  // steam-user keeps a connection alive — exit explicitly.
  setTimeout(() => process.exit(0), 1500);
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
