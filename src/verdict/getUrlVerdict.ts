/**
 * Verdict for a scanned URL — thin client over the Python backend.
 *
 * The backend owns all the real logic (RDAP, redirect resolve, punycode/IP
 * detection, verdict rules, community report count). This file:
 *   - Builds the HTTP request
 *   - Honors the debug "force verdict" / "force reason" flags without hitting
 *     the backend, so QA/demo can show every state deterministically
 *   - Degrades to a safe "unknown" shape on network failure
 */

import { API_BASE_URL } from '../config';

export type VerdictStatus = 'safe' | 'unknown' | 'dangerous';

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

export interface Indicator {
  label: string;
  value: string;
  attention: boolean;
}

export interface Verdict {
  status: VerdictStatus;
  reasonCode?: DangerReasonCode;
  reason?: string;
  finalUrl: string;
  host?: string | null;
  registrableDomain?: string | null;
  redirectedFrom?: string | null;
  shortenerUsed?: string | null;
  punycode: boolean;
  paymentLike?: boolean;
  domainAgeDays?: number | null;
  reportCount: number;
  threatIntelSources?: string[];
  trustedRank?: number | null;
  indicators: Indicator[];
}

function randomReasonCode(): DangerReasonCode {
  return DANGER_REASON_CODES[
    Math.floor(Math.random() * DANGER_REASON_CODES.length)
  ];
}

function fallbackVerdict(url: string): Verdict {
  return {
    status: 'unknown',
    finalUrl: url,
    host: null,
    registrableDomain: null,
    punycode: false,
    reportCount: 0,
    indicators: [
      {
        label: 'Status',
        value: 'Backend unreachable',
        attention: true,
      },
    ],
  };
}

function applyForce(
  base: Verdict,
  status: VerdictStatus,
  reasonCode: DangerReasonCode | null | undefined
): Verdict {
  // Override only status + reason; KEEP backend indicators / host / etc.
  // That way the debug menu still shows the real indicator rows (grey/orange
  // dots) alongside the forced badge.
  if (status === 'dangerous') {
    const code = reasonCode ?? randomReasonCode();
    return {
      ...base,
      status: 'dangerous',
      reasonCode: code,
      reason: DANGER_REASON_TEXT[code],
    };
  }
  return { ...base, status, reasonCode: undefined, reason: undefined };
}

export async function getUrlVerdict(
  url: string,
  forcedStatus?: VerdictStatus | null,
  forcedReasonCode?: DangerReasonCode | null
): Promise<Verdict> {
  let backend: Verdict;
  try {
    const res = await fetch(
      `${API_BASE_URL}/check?url=${encodeURIComponent(url)}`
    );
    backend = res.ok ? ((await res.json()) as Verdict) : fallbackVerdict(url);
  } catch {
    backend = fallbackVerdict(url);
  }
  if (forcedStatus) {
    return applyForce(backend, forcedStatus, forcedReasonCode ?? null);
  }
  return backend;
}

export async function sendReport(url: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { count: number };
    return data.count;
  } catch {
    return null;
  }
}

export async function undoReport(url: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/report`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { count: number };
    return data.count;
  } catch {
    return null;
  }
}
