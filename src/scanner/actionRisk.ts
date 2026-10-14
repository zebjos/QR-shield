/**
 * Risk classifier for non-URL QR payloads (SMS / tel / mailto / wifi / text).
 *
 * Two severity tiers:
 *   - `danger` — flips the Continue button to red + strong warning line.
 *     Used when the action can expose the user's traffic or credentials:
 *     joining an open Wi-Fi, an email subject that smells like phishing.
 *   - `warning` — soft amber chip above the details, button stays normal.
 *     Used for premium / surtaxed numbers (user may or may not want to
 *     charge their account, but it's not an attack).
 *
 * Premium-number coverage: France + Sweden (expand per market).
 */

import type { Payload } from './qrPayload';

type Severity = 'none' | 'warning' | 'danger';

export interface ActionRisk {
  severity: Severity;
  note?: string;
}

// --- Number helpers ---------------------------------------------------------

function norm(n: string): string {
  return n.replace(/[\s()\-.]/g, '');
}

// France: 081X / 089X premium voice; 3XXXX premium SMS short code.
const FR_PREMIUM_VOICE = /^(?:\+33|0033|0)8(?:1|9)\d/;
const FR_SHORT_CODE = /^3\d{4,5}$/; // 30000..399999

// Sweden: 0939 / 0900 premium voice; 7XXXX short code (72XXX/71XXX common).
const SE_PREMIUM_VOICE = /^(?:\+46|0046|0)9(?:00|39)/;
const SE_SHORT_CODE = /^7\d{4}$/;

// ITU-reserved international premium E.164.
const INTL_PREMIUM = /^\+?900/;

export function isPremiumNumber(raw: string): boolean {
  const n = norm(raw);
  return (
    FR_PREMIUM_VOICE.test(n) ||
    FR_SHORT_CODE.test(n) ||
    SE_PREMIUM_VOICE.test(n) ||
    SE_SHORT_CODE.test(n) ||
    INTL_PREMIUM.test(n)
  );
}

const EMAIL_SUSPICIOUS = /(reset|verify|secure|login|payment|invoice|urgent)/i;

// --- Classifier -------------------------------------------------------------

export function assessActionRisk(payload: Payload): ActionRisk {
  switch (payload.kind) {
    case 'wifi':
      if (!payload.auth || payload.auth.toLowerCase() === 'nopass') {
        return {
          severity: 'danger',
          note: 'Open network — traffic can be read by anyone nearby.',
        };
      }
      return { severity: 'none' };

    case 'sms':
    case 'tel':
      if (isPremiumNumber(payload.number)) {
        return {
          severity: 'warning',
          note: 'Premium / short-code number — may charge your account.',
        };
      }
      return { severity: 'none' };

    case 'mailto':
      if (payload.subject && EMAIL_SUSPICIOUS.test(payload.subject)) {
        return {
          severity: 'danger',
          note: 'Subject looks like a phishing lure.',
        };
      }
      return { severity: 'none' };

    default:
      return { severity: 'none' };
  }
}
