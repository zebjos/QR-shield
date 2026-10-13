/**
 * Offline / fallback verdict. Produces the same Verdict shape as the backend
 * using only what we can compute client-side (no network).
 *
 * Rules:
 *   - Punycode or IP host → dangerous (same strong local signals as the
 *     backend). The two zero-false-positive red flags we can catch alone.
 *   - Otherwise → unknown. We NEVER claim "safe" offline: the trusted-site
 *     check needs the backend's loaded top-domain lists.
 *   - Indicators show the real local values (HTTPS / shortener / payment-
 *     like / etc.) and mark the signals that need the backend as
 *     "Offline — needs network".
 */

import { getDomain, getPublicSuffix } from 'tldts';

import {
  DANGER_REASON_TEXT,
  type DangerReasonCode,
  type Indicator,
  type Verdict,
} from './getUrlVerdict';

const KNOWN_SHORTENERS = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'cutt.ly', 'rb.gy', 'rebrand.ly', 'short.io', 'tiny.cc',
]);

const PAYMENT_RE =
  /(?:^|[./-])(pay|payment|checkout|stripe|paypal|revolut|lydia|sumup|wero|wise|monzo|venmo|cashapp|donate|donation|invoice|billing|paiement|caisse)(?:[./-]|$)/i;

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

function getHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isIpHost(host: string): boolean {
  return IPV4_RE.test(host) || (host.startsWith('[') && host.endsWith(']'));
}

function hasPunycode(host: string): boolean {
  return host.split('.').some((l) => l.startsWith('xn--'));
}

function dangerous(code: DangerReasonCode, base: Verdict): Verdict {
  return {
    ...base,
    status: 'dangerous',
    reasonCode: code,
    reason: DANGER_REASON_TEXT[code],
  };
}

export function computeLocalVerdict(url: string): Verdict {
  const host = getHost(url);
  const registrable = host
    ? getDomain(host, { allowPrivateDomains: true }) ?? host
    : null;
  const isHttps = url.toLowerCase().startsWith('https://');
  const shortener = host && KNOWN_SHORTENERS.has(host) ? host : null;
  const punycode = !!host && hasPunycode(host);
  const paymentLike = PAYMENT_RE.test(url);

  const indicators: Indicator[] = [
    {
      label: 'Reputation',
      value: 'Offline — needs network',
      attention: false,
    },
    {
      label: 'Domain age',
      value: 'Offline — needs network',
      attention: false,
    },
    {
      label: 'Redirects',
      value: shortener ? `Redirects via ${shortener}` : 'No redirects detected',
      attention: !!shortener,
    },
    {
      label: 'Connection',
      value: isHttps ? 'HTTPS' : 'No HTTPS',
      attention: !isHttps,
    },
    {
      label: 'Community',
      value: 'Offline — needs network',
      attention: false,
    },
    {
      label: 'Threat intel',
      value: 'Offline — needs network',
      attention: false,
    },
  ];

  const base: Verdict = {
    status: 'unknown',
    finalUrl: url,
    host: host,
    registrableDomain: registrable,
    punycode,
    paymentLike,
    reportCount: 0,
    threatIntelSources: [],
    offline: true,
    indicators,
  };

  // Local red flags — zero false positives, safe to flag without network.
  if (host && isIpHost(host)) return dangerous('ipAddressHost', base);
  if (punycode) return dangerous('brandLookalike', base);

  return base;
}

// re-export for convenience
export { getPublicSuffix };
