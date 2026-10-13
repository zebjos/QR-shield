/**
 * One-step "Why?" micro-lessons shown under the dangerous reason, so the
 * alert itself teaches the user to spot the pattern next time.
 *
 * Each entry has:
 *   - why: a plain-language explanation of what signal fired
 *   - spot: a short "how to spot it next time" tip
 *
 * The `(ctx)` arg lets us weave in the actual host when relevant (lookalike
 * example: "the real domain is X, not Y"). Keep each string short — the sheet
 * is small and dense already.
 */

import type { DangerReasonCode } from './getUrlVerdict';

type Explainer = {
  why: (ctx: { host?: string | null; registrable?: string | null }) => string;
  spot: string;
};

export const WHY_EXPLAINERS: Record<DangerReasonCode, Explainer> = {
  brandLookalike: {
    why: (ctx) =>
      `The real website address is ${ctx.registrable ?? 'the full domain'}, not the brand name it mentions. Attackers add brand names to a domain they control to look familiar.`,
    spot:
      'Read the part right before the first "/". That is the real site. Anything to the left is just a subdomain the attacker chose.',
  },
  newlyRegisteredDomain: {
    why: () =>
      'This domain was registered very recently. Real businesses keep the same address for years; phishing kits are set up in minutes and burned when caught.',
    spot:
      'If you expected a well-known site, a brand-new domain is a strong hint something is off.',
  },
  reportedPhishing: {
    why: () =>
      'This exact link appears in open threat-intelligence feeds that other users and security tools flagged as phishing or malware.',
    spot:
      'Trust the collective signal: when multiple independent sources say "no", open the link only if you really need to.',
  },
  ipAddressHost: {
    why: () =>
      'This link points to a raw IP address (numbers), not a normal website name. Legitimate services almost never do this.',
    spot:
      'Any address starting with digits like 192.168.x.x or 85.23.x.x after "http://" is a red flag.',
  },
  suspiciousRedirectChain: {
    why: () =>
      'The link bounces through several unrelated websites before landing. This is a classic way to hide the real destination.',
    spot:
      'If you see a short URL (bit.ly, t.co…), expand it first. Our app shows the final destination.',
  },
};
