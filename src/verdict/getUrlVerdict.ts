/**
 * Verdict for a scanned URL.
 *
 * "safe"      — green  — checked and looks fine
 * "unknown"   — yellow — not checked yet / no signal either way
 * "dangerous" — red    — flagged; `reason` explains why in one line
 *
 * This is the ONLY file that should change when the real reputation-check
 * backend is wired up. Everything else in the app just calls
 * `getUrlVerdict(url)` and renders whatever it returns.
 */

export type VerdictStatus = 'safe' | 'unknown' | 'dangerous';

export interface Verdict {
  status: VerdictStatus;
  /** One-line reason shown to the user. Required for "dangerous", optional otherwise. */
  reason?: string;
}

const DANGEROUS_REASONS = [
  'This domain was registered very recently.',
  'This link mimics a well-known brand’s domain name.',
  'This domain has been reported for phishing.',
];

/**
 * PLACEHOLDER IMPLEMENTATION.
 * Returns a randomized verdict so the UI can be built and tested end-to-end
 * before the real URL reputation check exists.
 *
 * Swap this function's body for a real check (API call, on-device
 * heuristics, etc.) later — the signature and return type should stay the
 * same so callers don't need to change. Keep honoring `forcedStatus` even
 * after that swap — it's what backs the debug menu's "simulate verdict"
 * option, which stays useful for demos and QA once the real check exists.
 */
export async function getUrlVerdict(
  url: string,
  forcedStatus?: VerdictStatus | null
): Promise<Verdict> {
  if (forcedStatus) {
    if (forcedStatus === 'dangerous') {
      return {
        status: 'dangerous',
        reason: DANGEROUS_REASONS[Math.floor(Math.random() * DANGEROUS_REASONS.length)],
      };
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

  const reason =
    DANGEROUS_REASONS[Math.floor(Math.random() * DANGEROUS_REASONS.length)];
  return { status: 'dangerous', reason };
}
