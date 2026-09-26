/**
 * Verdict for a scanned URL.
 *
 * "safe"      — green  — checked and looks fine
 * "unknown"   — yellow — not checked yet / no signal either way
 * "dangerous" — red    — flagged; `reasonCode` says which specific red flag
 *                        was hit, `reason` is the one-line text for it
 *
 * This is the ONLY file that should change when the real reputation-check
 * backend is wired up. Everything else in the app just calls
 * `getUrlVerdict(url)` and renders whatever it returns.
 */

export type VerdictStatus = 'safe' | 'unknown' | 'dangerous';

/**
 * Specific red flags a real check could raise. Keep this list honest about
 * what the eventual backend can actually detect — each code should map to
 * a distinct, explainable signal, not just a different flavor of "bad."
 */
export type DangerReasonCode =
  | 'brandLookalike'
  | 'newlyRegisteredDomain'
  | 'reportedPhishing'
  | 'ipAddressHost'
  | 'suspiciousRedirectChain';

export const DANGER_REASON_TEXT: Record<DangerReasonCode, string> = {
  brandLookalike: 'This link mimics a well-known brand’s domain name.',
  newlyRegisteredDomain: 'This domain was registered very recently.',
  reportedPhishing: 'This domain has been reported for phishing.',
  ipAddressHost:
    'This link points to a raw IP address instead of a normal website name.',
  suspiciousRedirectChain:
    'This link redirects through several unrelated domains before landing.',
};

export const DANGER_REASON_CODES = Object.keys(
  DANGER_REASON_TEXT
) as DangerReasonCode[];

export interface Verdict {
  status: VerdictStatus;
  /** Only set when status is "dangerous". */
  reasonCode?: DangerReasonCode;
  /** One-line text for `reasonCode`, shown to the user. */
  reason?: string;
}

function randomReasonCode(): DangerReasonCode {
  return DANGER_REASON_CODES[Math.floor(Math.random() * DANGER_REASON_CODES.length)];
}

function dangerousVerdict(reasonCode: DangerReasonCode): Verdict {
  return { status: 'dangerous', reasonCode, reason: DANGER_REASON_TEXT[reasonCode] };
}

/**
 * PLACEHOLDER IMPLEMENTATION.
 * Returns a randomized verdict so the UI can be built and tested end-to-end
 * before the real URL reputation check exists.
 *
 * Swap this function's body for a real check (API call, on-device
 * heuristics, etc.) later — the signature and return type should stay the
 * same so callers don't need to change. Keep honoring `forcedStatus` /
 * `forcedReasonCode` even after that swap — they back the debug menu's
 * "simulate verdict" option, which stays useful for demos and QA once the
 * real check exists.
 */
export async function getUrlVerdict(
  url: string,
  forcedStatus?: VerdictStatus | null,
  forcedReasonCode?: DangerReasonCode | null
): Promise<Verdict> {
  if (forcedStatus) {
    if (forcedStatus === 'dangerous') {
      return dangerousVerdict(forcedReasonCode ?? randomReasonCode());
    }
    return { status: forcedStatus };
  }

  const roll = Math.random();

  if (roll < 0.34) {
    return { status: 'safe' };
  }

  if (roll < 0.67) {
    return { status: 'unknown' };
  }

  return dangerousVerdict(randomReasonCode());
}
