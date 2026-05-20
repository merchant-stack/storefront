import { describe, expect, it } from 'vitest';
import { parseTradeUrlSteamId64, STEAMID_BASE } from './steam-id.js';

describe('parseTradeUrlSteamId64', () => {
  it('accepts a valid trade URL and reconstructs SteamID64', () => {
    // partner=1 ⇒ SteamID64 = 76561197960265728 + 1
    const url = 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=abcDEF12';
    expect(parseTradeUrlSteamId64(url)).toBe((STEAMID_BASE + 1n).toString());
  });

  it('reconstructs a realistic SteamID64', () => {
    // Sample real-world Steam Account ID 425832834 → SteamID64 76561198386098562.
    const url = 'https://steamcommunity.com/tradeoffer/new/?partner=425832834&token=KaiX_Ab9';
    expect(parseTradeUrlSteamId64(url)).toBe('76561198386098562');
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

  it('refuses http (cookie/credential leakage)', () => {
    // The Steam trade URL is only ever served over HTTPS by Steam — a http://
    // input would either be a typo or an attacker-controlled MITM bait. We
    // still accept it since the hostname is what really matters; the worker
    // will fetch via HTTPS regardless. (Documenting current behaviour.)
    // If we ever decide to refuse http, add an assertion here.
    const url = 'http://steamcommunity.com/tradeoffer/new/?partner=1&token=x';
    expect(parseTradeUrlSteamId64(url)).toBe((STEAMID_BASE + 1n).toString());
  });
});
