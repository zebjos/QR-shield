import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useDebugSettings } from '../debug/DebugSettingsContext';
import type { RootStackParamList } from '../navigation/types';
import {
  describePayload,
  hasPunycode,
  parsePayload,
  splitUrlForDisplay,
  type Payload,
} from '../scanner/qrPayload';
import { getUrlVerdict, type Verdict } from '../verdict/getUrlVerdict';
import { triggerDangerVibration } from '../verdict/verdictHaptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

// iOS semantic-color approximation
const C = {
  label: '#000000',
  secondary: '#8E8E93',
  tertiary: '#C7C7CC',
  separator: '#C6C6C8',
  red: '#FF3B30',
  redBg: '#FEF2F2',
  redText: '#B91C1C',
  orange: '#FF9500',
  orangeBg: '#FFF4E5',
  orangeText: '#9A5B00',
  blue: '#007AFF',
  neutralBg: '#F2F2F7',
  neutralChip: '#E5E5EA',
};

const STATUS_CONFIG = {
  safe: { label: 'SAFE', symbol: '✓', background: '#1B873F' },
  unknown: { label: 'No known threat', symbol: '', background: C.orangeBg }, // kept for symmetry but unknown uses a pill
  dangerous: { label: 'DANGEROUS', symbol: '⚠', background: C.red },
} as const;

const DANGEROUS_RECOMMENDATION =
  'Don’t open this link. If you need this information, ask staff or type the website address yourself.';

type Indicator = { label: string; value: string; attention: boolean };

// --- Mock indicator data ------------------------------------------------------
// Per-host overrides for the demo. Anything not listed falls back to defaults
// derived from the URL (protocol real; age/reports fabricated).

const KNOWN_SHORTENERS = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'cutt.ly', 'rb.gy', 'rebrand.ly',
]);

type MockHost = {
  ageText: string;
  ageAttention: boolean;
  reports: number;
};

const MOCK_HOSTS: Record<string, MockHost> = {
  'example.com': { ageText: 'Created in 1995', ageAttention: false, reports: 0 },
  'paypal-secure-login.com': { ageText: 'Created 3 days ago', ageAttention: true, reports: 12 },
  'bit.ly': { ageText: 'Created in 2008', ageAttention: false, reports: 3 },
  'login-verify.xyz': { ageText: 'Created 2 months ago', ageAttention: true, reports: 7 },
};
const DEFAULT_HOST: MockHost = { ageText: 'Created in 2018', ageAttention: false, reports: 0 };

function buildIndicators(url: string): Indicator[] {
  const host = safeHost(url) ?? '';
  const isHttps = url.toLowerCase().startsWith('https://');
  const shortener = KNOWN_SHORTENERS.has(host) ? host : null;
  const mock = MOCK_HOSTS[host] ?? DEFAULT_HOST;
  return [
    {
      label: 'Domain age',
      value: mock.ageText,
      attention: mock.ageAttention,
    },
    {
      label: 'Redirects',
      value: shortener ? `Redirects via ${shortener}` : 'No redirects',
      attention: !!shortener,
    },
    {
      label: 'Connection',
      value: isHttps ? 'HTTPS' : 'No HTTPS',
      attention: !isHttps,
    },
    {
      label: 'Community',
      value: mock.reports > 0
        ? `${mock.reports} report${mock.reports > 1 ? 's' : ''}`
        : 'No reports',
      attention: mock.reports > 0,
    },
  ];
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// --- Rows ---------------------------------------------------------------------

function InfoRow({
  label,
  value,
  attention,
  last,
}: {
  label: string;
  value: string;
  attention: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowDivider]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoRight}>
        <Text
          style={[
            styles.infoValue,
            { color: attention ? C.orangeText : C.secondary },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
        <View
          style={[
            styles.sevDot,
            { backgroundColor: attention ? C.orange : C.tertiary },
          ]}
        />
      </View>
    </View>
  );
}

function HighlightedUrl({ url }: { url: string }) {
  const parts = useMemo(() => splitUrlForDisplay(url), [url]);
  if (!parts.registrable) {
    return (
      <Text style={styles.url} selectable numberOfLines={3}>
        {url}
      </Text>
    );
  }
  return (
    <Text style={styles.url} selectable numberOfLines={3}>
      <Text style={styles.urlDim}>{parts.prefix}</Text>
      <Text style={styles.urlBold}>{parts.registrable}</Text>
      <Text style={styles.urlDim}>{parts.suffix}</Text>
    </Text>
  );
}

// --- Non-URL sheet ------------------------------------------------------------

function NonUrlSheet({
  payload,
  onCancel,
  onContinue,
}: {
  payload: Payload;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const kindLabel = {
    sms: 'Text message',
    tel: 'Phone call',
    mailto: 'Email',
    wifi: 'Wi-Fi network',
    text: 'Plain text',
  }[payload.kind as Exclude<Payload['kind'], 'url'>];

  return (
    <>
      <View style={styles.kindPill}>
        <Text style={styles.kindPillText}>{kindLabel.toUpperCase()}</Text>
      </View>
      <Text style={styles.nonUrlTitle}>{describePayload(payload)}</Text>
      <NonUrlDetails payload={payload} />
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.openButton]}
          onPress={onContinue}
        >
          <Text style={styles.openButtonText}>Continue</Text>
        </Pressable>
      </View>
    </>
  );
}

function NonUrlDetails({ payload }: { payload: Payload }) {
  if (payload.kind === 'sms') {
    return (
      <View style={styles.infoList}>
        <InfoRow label="To" value={payload.number} attention={false} />
        <InfoRow
          label="Message"
          value={payload.body ?? '(empty)'}
          attention={false}
          last
        />
      </View>
    );
  }
  if (payload.kind === 'tel') {
    return (
      <View style={styles.infoList}>
        <InfoRow label="Number" value={payload.number} attention={false} last />
      </View>
    );
  }
  if (payload.kind === 'mailto') {
    return (
      <View style={styles.infoList}>
        <InfoRow label="To" value={payload.address} attention={false} />
        <InfoRow
          label="Subject"
          value={payload.subject ?? '(none)'}
          attention={false}
          last
        />
      </View>
    );
  }
  if (payload.kind === 'wifi') {
    return (
      <View style={styles.infoList}>
        <InfoRow label="Network" value={payload.ssid} attention={false} />
        <InfoRow
          label="Security"
          value={payload.auth ?? 'open'}
          attention={payload.auth === 'nopass' || !payload.auth}
          last
        />
      </View>
    );
  }
  if (payload.kind === 'text') {
    return (
      <View style={styles.infoList}>
        <InfoRow label="Content" value={payload.text} attention={false} last />
      </View>
    );
  }
  return null;
}

// --- Screen -------------------------------------------------------------------

export default function ResultScreen({ route, navigation }: Props) {
  const { url: raw } = route.params;
  const { forcedVerdict, forcedReasonCode } = useDebugSettings();
  const payload = useMemo(() => parsePayload(raw), [raw]);
  const isUrl = payload.kind === 'url';
  const urlForIntel = isUrl ? payload.url : '';
  const indicators = useMemo(
    () => (isUrl ? buildIndicators(urlForIntel) : []),
    [isUrl, urlForIntel]
  );
  const punycode = isUrl ? hasPunycode(urlForIntel) : false;
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (!isUrl) return;
    let cancelled = false;
    setVerdict(null);
    getUrlVerdict(raw, forcedVerdict, forcedReasonCode).then((result) => {
      if (!cancelled) {
        setVerdict(result);
        triggerDangerVibration(result.status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [raw, forcedVerdict, forcedReasonCode, isUrl]);

  const handleCancel = () => navigation.goBack();
  const handleContinue = () => {
    if (payload.kind === 'wifi') {
      // Can't programmatically connect to Wi-Fi on iOS from JS; let the user
      // handle it. For the demo, just dismiss.
      navigation.goBack();
      return;
    }
    Linking.openURL(raw);
  };

  // Non-URL payload → separate sheet, no verdict badge.
  if (!isUrl) {
    return (
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />
          <NonUrlSheet
            payload={payload}
            onCancel={handleCancel}
            onContinue={handleContinue}
          />
        </Pressable>
      </Pressable>
    );
  }

  const url = urlForIntel;

  return (
    <Pressable style={styles.backdrop} onPress={handleCancel}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.grabber} />

        {!verdict ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Checking link…</Text>
          </View>
        ) : (
          <>
            <View style={styles.urlBlock}>
              <Text style={styles.urlLabel}>Destination</Text>
              <HighlightedUrl url={url} />
              {punycode ? (
                <Text style={styles.punycodeHint}>
                  Contains punycode (xn--) — possible lookalike domain.
                </Text>
              ) : null}
            </View>

            {verdict.status === 'unknown' ? (
              <View style={styles.unknownPill}>
                <Text style={styles.unknownPillText}>No known threat</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: STATUS_CONFIG[verdict.status].background },
                ]}
              >
                {STATUS_CONFIG[verdict.status].symbol ? (
                  <Text style={styles.statusSymbol}>
                    {STATUS_CONFIG[verdict.status].symbol}
                  </Text>
                ) : null}
                <Text style={styles.statusLabel}>
                  {STATUS_CONFIG[verdict.status].label}
                </Text>
              </View>
            )}

            {verdict.status === 'dangerous' && verdict.reason ? (
              <>
                <Text style={styles.reason}>{verdict.reason}</Text>
                <Text style={styles.recommendation}>
                  {DANGEROUS_RECOMMENDATION}
                </Text>
              </>
            ) : null}

            {verdict.status === 'unknown' ? (
              <View style={styles.infoList}>
                {indicators.map((ind, i) => (
                  <InfoRow
                    key={ind.label}
                    label={ind.label}
                    value={ind.value}
                    attention={ind.attention}
                    last={i === indicators.length - 1}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.openButton]}
                onPress={handleContinue}
              >
                <Text style={styles.openButtonText}>Open Website</Text>
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.reportButton,
                reported && styles.reportButtonReported,
              ]}
              onPress={() => setReported((r) => !r)}
            >
              <Text
                style={[
                  styles.reportButtonText,
                  reported && styles.reportButtonTextReported,
                ]}
              >
                {reported ? 'Reported — tap to undo' : 'Report this link'}
              </Text>
            </Pressable>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

// --- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    marginBottom: 20,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#444',
  },
  urlBlock: {
    marginBottom: 20,
  },
  urlLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  url: {
    fontSize: 17,
    color: C.label,
  },
  urlDim: {
    color: C.secondary,
    fontWeight: '400',
  },
  urlBold: {
    color: C.label,
    fontWeight: '700',
  },
  punycodeHint: {
    marginTop: 6,
    fontSize: 13,
    color: C.redText,
  },
  statusBadge: {
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSymbol: {
    fontSize: 44,
    color: '#fff',
    fontWeight: '700',
  },
  statusLabel: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  reason: {
    marginTop: 14,
    fontSize: 15,
    color: C.redText,
    textAlign: 'center',
    fontWeight: '500',
  },
  recommendation: {
    marginTop: 8,
    fontSize: 14,
    color: C.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  unknownPill: {
    alignSelf: 'flex-start',
    backgroundColor: C.neutralChip,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  unknownPillText: {
    color: C.label,
    fontSize: 13,
    fontWeight: '600',
  },
  infoList: {
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.separator,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.separator,
  },
  infoLabel: {
    fontSize: 15,
    color: C.label,
    opacity: 0.6,
    flexShrink: 0,
    marginRight: 12,
  },
  infoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  sevDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  reportButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  reportButtonText: {
    color: C.redText,
    fontSize: 15,
    fontWeight: '600',
  },
  reportButtonReported: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  reportButtonTextReported: {
    color: '#374151',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F1F1F1',
  },
  cancelButtonText: {
    color: C.label,
    fontSize: 16,
    fontWeight: '600',
  },
  openButton: {
    backgroundColor: '#111',
  },
  openButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  kindPill: {
    alignSelf: 'flex-start',
    backgroundColor: C.neutralChip,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  kindPillText: {
    color: C.label,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  nonUrlTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: C.label,
    lineHeight: 26,
    marginBottom: 4,
  },
});
