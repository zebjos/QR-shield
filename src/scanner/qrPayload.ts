/**
 * QR codes carry many kinds of payload beyond web links. We parse the raw
 * string into a typed payload so the result sheet can show a plain-language
 * description of what tapping "Continue" would actually do.
 *
 * Non-URL kinds supported here: sms, tel, mailto, wifi. Anything else that
 * isn't an http(s) URL falls back to `text`.
 */

export type Payload =
  | { kind: 'url'; url: string }
  | { kind: 'sms'; number: string; body?: string }
  | { kind: 'tel'; number: string }
  | { kind: 'mailto'; address: string; subject?: string; body?: string }
  | { kind: 'wifi'; ssid: string; auth?: string; password?: string; hidden?: boolean }
  | { kind: 'text'; text: string };

export function parsePayload(raw: string): Payload {
  const data = raw.trim();
  const lower = data.toLowerCase();

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return { kind: 'url', url: data };
  }

  if (lower.startsWith('sms:') || lower.startsWith('smsto:')) {
    const rest = data.slice(data.indexOf(':') + 1);
    if (lower.startsWith('smsto:')) {
      const [number, body] = rest.split(':', 2);
      return { kind: 'sms', number, body };
    }
    const [number, query] = rest.split('?', 2);
    const body = query ? new URLSearchParams(query).get('body') ?? undefined : undefined;
    return { kind: 'sms', number, body };
  }

  if (lower.startsWith('tel:')) {
    return { kind: 'tel', number: data.slice(4) };
  }

  if (lower.startsWith('mailto:')) {
    const rest = data.slice(7);
    const [address, query] = rest.split('?', 2);
    const params = query ? new URLSearchParams(query) : null;
    return {
      kind: 'mailto',
      address,
      subject: params?.get('subject') ?? undefined,
      body: params?.get('body') ?? undefined,
    };
  }

  if (lower.startsWith('wifi:')) {
    // WIFI:T:WPA;S:Name;P:pass;H:true;;
    const body = data.slice(5);
    const fields = Object.fromEntries(
      body
        .split(';')
        .map((f) => f.split(':', 2))
        .filter((p) => p.length === 2) as [string, string][]
    );
    return {
      kind: 'wifi',
      ssid: fields['S'] ?? '',
      auth: fields['T'] || undefined,
      password: fields['P'] || undefined,
      hidden: fields['H']?.toLowerCase() === 'true' || undefined,
    };
  }

  return { kind: 'text', text: data };
}

export function describePayload(p: Payload): string {
  switch (p.kind) {
    case 'url':
      return `This QR code will open ${safeHost(p.url) ?? 'a website'}.`;
    case 'sms':
      return `This QR code will send a text message to ${p.number}.`;
    case 'tel':
      return `This QR code will call ${p.number}.`;
    case 'mailto':
      return `This QR code will start an email to ${p.address}.`;
    case 'wifi':
      return `This QR code will connect you to the Wi-Fi network "${p.ssid}".`;
    case 'text':
      return 'This QR code contains plain text.';
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Public Suffix List with private suffixes enabled. Without
// `allowPrivateDomains`, `paypal-login.github.io` would collapse to
// `github.io`, and we'd bold "github.io" in the URL — making a hostile
// subdomain look like it's hosted by GitHub itself. With it, the function
// returns `paypal-login.github.io` so the user sees the actual actor's name
// in bold.
import { getDomain as tldtsGetDomain } from 'tldts';

export function getRegistrableDomain(host: string): string {
  return (
    tldtsGetDomain(host, { allowPrivateDomains: true }) ?? host.toLowerCase()
  );
}

export function splitUrlForDisplay(
  url: string
): { prefix: string; registrable: string; suffix: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const reg = getRegistrableDomain(host);
    const hostIdx = url.toLowerCase().indexOf(host);
    if (hostIdx < 0) return { prefix: '', registrable: '', suffix: url };
    const regStart = hostIdx + host.length - reg.length;
    return {
      prefix: url.slice(0, regStart),
      registrable: url.slice(regStart, regStart + reg.length),
      suffix: url.slice(regStart + reg.length),
    };
  } catch {
    return { prefix: '', registrable: '', suffix: url };
  }
}

export function hasPunycode(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.split('.').some((l) => l.startsWith('xn--'));
  } catch {
    return false;
  }
}
