#!/usr/bin/env node
// Pre-commit secret scanner. Reads the staged diff and rejects the commit if
// any line looks like a real credential. Designed to be paranoid — false
// positives are cheap (you fix the diff or pass --no-verify with a reason),
// false negatives are catastrophic.

import { execSync } from 'node:child_process';

const PATTERNS = [
  // Common token / key patterns. Each entry is [regex, description].
  [/sk_live_[A-Za-z0-9]{20,}/, 'Stripe live secret key'],
  [/sk_test_[A-Za-z0-9]{20,}/, 'Stripe test secret key'],
  [/rk_live_[A-Za-z0-9]{20,}/, 'Stripe restricted key'],
  [/whsec_[A-Za-z0-9]{20,}/, 'Stripe webhook secret'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key ID'],
  [/(?:^|[^A-Za-z0-9])ghp_[A-Za-z0-9]{36}/, 'GitHub personal access token'],
  [/(?:^|[^A-Za-z0-9])ghs_[A-Za-z0-9]{36}/, 'GitHub server token'],
  [/(?:^|[^A-Za-z0-9])eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'JWT (signed)'],
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/, 'Private key'],
  // DMarket Ed25519 keys are 64 bytes hex (128 chars). Match anything that looks
  // like a long hex string assigned to a *SECRET* var.
  [/DMARKET_SECRET_KEY\s*[:=]\s*['"]?[a-f0-9]{64,128}['"]?/i, 'DMarket secret key'],
  [/STEAM_BOT_(?:PASSWORD|SHARED_SECRET|IDENTITY_SECRET)\s*[:=]\s*['"]?\S{6,}/i, 'Steam bot secret'],
  [/COOKIE_SECRET\s*[:=]\s*['"]?[a-f0-9]{32,}['"]?/i, 'Cookie signing secret'],
  // Generic high-entropy assignment: a value over 40 chars of mixed case/digits
  // assigned to a var whose name contains "secret", "token", "key", "password".
  [
    /(?:secret|token|api[_-]?key|password|pwd)\s*[:=]\s*['"]?[A-Za-z0-9+/=_-]{40,}['"]?/i,
    'High-entropy value assigned to credential-like name',
  ],
];

// Allow-list: lines containing this marker are exempt (use sparingly + comment why).
const ALLOW_MARKER = 'allow-secret:';

function getStagedDiff() {
  try {
    return execSync('git diff --cached --unified=0 --no-color', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    console.error('scan-secrets: failed to read staged diff', err.message);
    process.exit(1);
  }
}

const diff = getStagedDiff();
if (!diff) {
  // Nothing staged.
  process.exit(0);
}

let currentFile = null;
let currentLine = 0;
const findings = [];

for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ b/')) {
    currentFile = raw.slice(6);
    continue;
  }
  if (raw.startsWith('@@')) {
    const m = raw.match(/\+(\d+)/);
    currentLine = m ? Number(m[1]) - 1 : 0;
    continue;
  }
  if (!raw.startsWith('+') || raw.startsWith('+++')) continue;

  currentLine += 1;
  const line = raw.slice(1);
  if (line.includes(ALLOW_MARKER)) continue;

  for (const [regex, desc] of PATTERNS) {
    if (regex.test(line)) {
      findings.push({ file: currentFile, line: currentLine, desc, snippet: line.trim().slice(0, 120) });
      break;
    }
  }
}

if (findings.length === 0) {
  process.exit(0);
}

console.error('\n  ✖ scan-secrets: refusing to commit — possible secrets detected:\n');
for (const f of findings) {
  console.error(`    ${f.file}:${f.line}  [${f.desc}]`);
  console.error(`        ${f.snippet}`);
}
console.error(
  `\n  If this is a false positive, add the marker \`${ALLOW_MARKER} <reason>\` to the same line,`,
);
console.error('  or move the value into .env.local (which is gitignored).\n');
process.exit(1);
