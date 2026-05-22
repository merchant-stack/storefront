import { describe, expect, it } from 'vitest';
import { parseTradeUrlSteamId64, STEAMID_BASE } from './steam-id.js';

describe('parseTradeUrlSteamId64', () => {
  it('accepts a valid trade URL and reconstructs SteamID64', () => {
    // partner=1 ⇒ SteamID64 = 76561197960265728 + 1
    const url = 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=abcDEF12';
    const result = parseTradeUrlSteamId64(url);
    expect(result?.steamId64).toBe((STEAMID_BASE + 1n).toString());
    expect(result?.canonical).toBe(url);
  });

  it('reconstructs a realistic SteamID64', () => {
    // Sample real-world Steam Account ID 425832834 → SteamID64 76561198386098562.
    const url = 'https://steamcommunity.com/tradeoffer/new/?partner=425832834&token=KaiX_Ab9';
    const result = parseTradeUrlSteamId64(url);
    expect(result?.steamId64).toBe('76561198386098562');
    expect(result?.canonical).toBe(url);
  });

  it('strips extra query params in the canonical form', () => {
    // User may paste a URL with extra params (e.g. utm_source from Steam emails).
    // We must drop them so downstream consumers see only the known fields.
    const input =
      'https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc&extra=evil&utm_source=ad';
    const result = parseTradeUrlSteamId64(input);
    expect(result?.canonical).toBe('https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc');
  });

  it('rejects non-Steam hostnames', () => {
    expect(parseTradeUrlSteamId64('https://evil.com/tradeoffer/new/?partner=1&token=x')).toBeNull();
    expect(
      parseTradeUrlSteamId64('https://steamcommunity.com.attacker.com/tradeoffer/new/?partner=1&token=x'),
    ).toBeNull();
  });

  it('rejects wrong path', () => {
    expect(parseTradeUrlSteamId64('https://steamcommunity.com/profiles/123?partner=1&token=x')).toBeNull();
    expect(parseTradeUrlSteamId64('https://steamcommunity.com/tradeoffer/new?partner=1&token=x')).toBeNull();
  });

  it('rejects missing query params', () => {
    expect(parseTradeUrlSteamId64('https://steamcommunity.com/tradeoffer/new/')).toBeNull();
    expect(parseTradeUrlSteamId64('https://steamcommunity.com/tradeoffer/new/?partner=1')).toBeNull();
    expect(parseTradeUrlSteamId64('https://steamcommunity.com/tradeoffer/new/?token=x')).toBeNull();
  });

  it('rejects non-numeric partner', () => {
    expect(
      parseTradeUrlSteamId64('https://steamcommunity.com/tradeoffer/new/?partner=abc&token=x'),
    ).toBeNull();
    expect(
      parseTradeUrlSteamId64('https://steamcommunity.com/tradeoffer/new/?partner=1.5&token=x'),
    ).toBeNull();
  });

  it('rejects token with unsafe characters', () => {
    expect(
      parseTradeUrlSteamId64('https://steamcommunity.com/tradeoffer/new/?partner=1&token=ab cd'),
    ).toBeNull();
    expect(
      parseTradeUrlSteamId64("https://steamcommunity.com/tradeoffer/new/?partner=1&token=ab'cd"),
    ).toBeNull();
  });

  it('rejects malformed URLs', () => {
    expect(parseTradeUrlSteamId64('not a url')).toBeNull();
    expect(parseTradeUrlSteamId64('')).toBeNull();
  });

  it('rejects http (only https accepted)', () => {
    // Steam serves trade URLs only over HTTPS — a http:// input is either a
    // typo or attacker-controlled MITM bait. Refused outright.
    expect(
      parseTradeUrlSteamId64('http://steamcommunity.com/tradeoffer/new/?partner=1&token=x'),
    ).toBeNull();
  });
});
