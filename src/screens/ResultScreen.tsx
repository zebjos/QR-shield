import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cubicBezier,
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useDebugSettings } from '../debug/DebugSettingsContext';
import type { RootStackParamList } from '../navigation/types';
import {
  describePayload,
  parsePayload,
  splitUrlForDisplay,
  type Payload,
} from '../scanner/qrPayload';
import {
  getUrlVerdict,
  sendReport,
  undoReport,
  type Indicator,
  type Verdict,
} from '../verdict/getUrlVerdict';
import { triggerDangerVibration } from '../verdict/verdictHaptics';
import { WHY_EXPLAINERS } from '../verdict/whyExplainers';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

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
  unknown: { label: 'No known threat', symbol: '', background: C.orangeBg },
  dangerous: { label: 'DANGEROUS', symbol: '⚠', background: C.red },
} as const;

const DANGEROUS_RECOMMENDATION =
  'Don’t open this link. If you need this information, ask staff or type the website address yourself.';

// Reanimated CSS keyframes — plays once on mount, visual counterpart to the
// vibration for the dangerous verdict (and the only alert cue on desktop web,
// where navigator.vibrate is unavailable).
const DANGER_SHAKE: Record<string, unknown> = {
  animationName: {
    '0%': { transform: [{ translateX: 0 }] },
    '15%': { transform: [{ translateX: -8 }] },
    '30%': { transform: [{ translateX: 8 }] },
    '45%': { transform: [{ translateX: -6 }] },
    '60%': { transform: [{ translateX: 6 }] },
    '75%': { transform: [{ translateX: -3 }] },
    '100%': { transform: [{ translateX: 0 }] },
  },
  animationDuration: 450,
  animationTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
  animationIterationCount: 1,
};

// --- Press feedback ---------------------------------------------------------
function PressableScale({
  onPress,
  style,
  containerStyle,
  children,
  scale = 0.97,
}: {
  onPress?: () => void;
  /** Visual style (background, padding, border…) applied to the inner animated layer. */
  style?: StyleProp<ViewStyle>;
  /** Layout style (flex, width, margin…) applied to the outer Pressable so the
   *  element participates in its parent's layout correctly. */
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  scale?: number;
}) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  const target = reduced ? 1 : pressed ? scale : 1;
  const opacity = reduced ? 1 : pressed ? 0.9 : 1;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={containerStyle}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale: target }],
            opacity,
            transitionProperty: ['transform', 'opacity'],
            transitionDuration: 120,
            transitionTimingFunction: 'ease-out',
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

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

// --- Non-URL sheet ----------------------------------------------------------

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
        <PressableScale
          containerStyle={styles.btnFlex}
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </PressableScale>
        <PressableScale
          containerStyle={styles.btnFlex}
          style={[styles.button, styles.openButton]}
          onPress={onContinue}
        >
          <Text style={styles.openButtonText}>Continue</Text>
        </PressableScale>
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

// --- Screen -----------------------------------------------------------------

export default function ResultScreen({ route, navigation }: Props) {
  const { url: raw } = route.params;
  const { forcedVerdict, forcedReasonCode, safeAutoOpen } = useDebugSettings();
  const payload = useMemo(() => parsePayload(raw), [raw]);
  const isUrl = payload.kind === 'url';
  const urlForIntel = isUrl ? payload.url : '';
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [reported, setReported] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [goodCall, setGoodCall] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!isUrl) return;
    let cancelled = false;
    let autoOpenTimer: ReturnType<typeof setTimeout> | null = null;
    setVerdict(null);
    getUrlVerdict(urlForIntel, forcedVerdict, forcedReasonCode).then((result) => {
      if (cancelled) return;
      setVerdict(result);
      triggerDangerVibration(result.status);
      // Trusted / safe URL → user shouldn't have to tap "Open". Flash the
      // safe state for 500ms (so they SEE why we didn't ask), then open.
      // Debug toggle `safeAutoOpen` lets the team pivot to always-ask without
      // a redeploy.
      if (result.status === 'safe' && safeAutoOpen) {
        autoOpenTimer = setTimeout(() => {
          Linking.openURL(result.finalUrl ?? urlForIntel);
          navigation.goBack();
        }, 500);
      }
    });
    return () => {
      cancelled = true;
      if (autoOpenTimer) clearTimeout(autoOpenTimer);
    };
  }, [urlForIntel, forcedVerdict, forcedReasonCode, isUrl, navigation, safeAutoOpen]);

  const handleCancel = () => {
    // Cancelled a dangerous link → surface a brief positive reinforcement
    // instead of silently closing. Positive feedback for the right behaviour
    // (vs. the usual "only punish bad choices" asymmetry).
    if (verdict?.status === 'dangerous') {
      setGoodCall(true);
      setTimeout(() => navigation.goBack(), 1600);
      return;
    }
    navigation.goBack();
  };
  const handleContinue = () => {
    if (payload.kind === 'wifi') {
      navigation.goBack();
      return;
    }
    const target = verdict?.finalUrl ?? raw;
    Linking.openURL(target);
  };

  const handleToggleReport = async () => {
    if (!isUrl) return;
    const next = !reported;
    setReported(next);
    const op = next ? sendReport : undoReport;
    const newCount = await op(urlForIntel);
    if (newCount !== null && verdict) {
      // Reflect the new count in the Community indicator row.
      setVerdict({
        ...verdict,
        reportCount: newCount,
        indicators: verdict.indicators.map((ind) =>
          ind.label === 'Community'
            ? {
                ...ind,
                value:
                  newCount > 0
                    ? `${newCount} report${newCount > 1 ? 's' : ''}`
                    : 'No reports',
                attention: newCount > 0,
              }
            : ind
        ),
      });
    }
  };

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

  if (goodCall) {
    return (
      <View style={styles.backdrop}>
        <Animated.View
          style={styles.sheet}
          entering={reduced ? undefined : FadeIn.duration(140)}
        >
          <View style={styles.goodCallBox}>
            <Text style={styles.goodCallCheck}>✓</Text>
            <Text style={styles.goodCallTitle}>Good call.</Text>
            <Text style={styles.goodCallText}>
              You just avoided a flagged page.
            </Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <Pressable style={styles.backdrop} onPress={handleCancel}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.grabber} />

        {!verdict ? (
          <Animated.View
            key="loading"
            exiting={reduced ? undefined : FadeOut.duration(100)}
            style={styles.loadingContainer}
          >
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Checking link…</Text>
          </Animated.View>
        ) : (
          <Animated.View
            key="verdict"
            entering={reduced ? undefined : FadeIn.duration(180)}
          >
            <View style={styles.urlBlock}>
              <Text style={styles.urlLabel}>Destination</Text>
              <HighlightedUrl url={verdict.finalUrl || urlForIntel} />
              {verdict.redirectedFrom ? (
                <Text style={styles.redirectHint} numberOfLines={2}>
                  Redirected from {verdict.redirectedFrom}
                </Text>
              ) : null}
              {verdict.punycode ? (
                <Text style={styles.punycodeHint}>
                  Contains punycode (xn--) — possible lookalike domain.
                </Text>
              ) : null}
              {verdict.offline ? (
                <View style={styles.offlineBadge}>
                  <Text style={styles.offlineBadgeText}>
                    Offline mode — limited checks
                  </Text>
                </View>
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
              <Animated.View style={reduced ? undefined : DANGER_SHAKE}>
                <Text style={styles.reason}>{verdict.reason}</Text>
                <Text style={styles.recommendation}>
                  {DANGEROUS_RECOMMENDATION}
                </Text>
                {verdict.reasonCode && WHY_EXPLAINERS[verdict.reasonCode] ? (
                  <>
                    <Pressable onPress={() => setWhyOpen((v) => !v)}>
                      <Text style={styles.whyToggle}>
                        {whyOpen ? '− Hide explanation' : 'Why is this flagged?'}
                      </Text>
                    </Pressable>
                    {whyOpen ? (
                      <View style={styles.whyBox}>
                        <Text style={styles.whyText}>
                          {WHY_EXPLAINERS[verdict.reasonCode].why({
                            host: verdict.host,
                            registrable: verdict.registrableDomain,
                          })}
                        </Text>
                        <Text style={styles.whyTip}>
                          How to spot it next time —{' '}
                          {WHY_EXPLAINERS[verdict.reasonCode].spot}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </Animated.View>
            ) : null}

            {verdict.paymentLike ? (
              <View style={styles.stickerBox}>
                <Text style={styles.stickerTitle}>Looks like a payment page</Text>
                <Text style={styles.stickerText}>
                  Check that this QR code isn’t a sticker placed over another
                  one. Attackers glue their QR codes on top of legitimate ones
                  on parking meters, menus, invoices, etc.
                </Text>
              </View>
            ) : null}

            {verdict.status === 'unknown' && verdict.indicators.length > 0 ? (
              <View style={styles.infoList}>
                {verdict.indicators.map((ind: Indicator, i: number) => (
                  <InfoRow
                    key={ind.label}
                    label={ind.label}
                    value={ind.value}
                    attention={ind.attention}
                    last={i === verdict.indicators.length - 1}
                  />
                ))}
              </View>
            ) : null}

            {verdict.status === 'safe' && safeAutoOpen ? (
              // Auto-opens in 500ms — just show a one-liner so the user sees
              // we flashed the state, no decision to make.
              <Text style={styles.autoOpenHint}>Opening in your browser…</Text>
            ) : (
              <View style={styles.buttonRow}>
                <PressableScale
                  containerStyle={styles.btnFlex}
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleCancel}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </PressableScale>
                <PressableScale
                  containerStyle={styles.btnFlex}
                  style={[styles.button, styles.openButton]}
                  onPress={handleContinue}
                >
                  <Text style={styles.openButtonText}>Open Website</Text>
                </PressableScale>
              </View>
            )}

            {verdict.status !== 'safe' ? (
            <PressableScale
              containerStyle={styles.reportContainer}
              style={[
                styles.reportButton,
                reported && styles.reportButtonReported,
              ]}
              onPress={handleToggleReport}
            >
              <View style={styles.reportLabelStack}>
                <Animated.Text
                  style={[
                    styles.reportButtonText,
                    styles.reportLabel,
                    {
                      opacity: reported ? 0 : 1,
                      transitionProperty: ['opacity'],
                      transitionDuration: 150,
                      transitionTimingFunction: 'ease-out',
                    },
                  ]}
                >
                  Report this link
                </Animated.Text>
                <Animated.Text
                  style={[
                    styles.reportButtonText,
                    styles.reportButtonTextReported,
                    styles.reportLabel,
                    {
                      opacity: reported ? 1 : 0,
                      transitionProperty: ['opacity'],
                      transitionDuration: 150,
                      transitionTimingFunction: 'ease-out',
                    },
                  ]}
                >
                  Reported — tap to undo
                </Animated.Text>
              </View>
            </PressableScale>
            ) : null}
          </Animated.View>
        )}
      </Pressable>
    </Pressable>
  );
}

// --- Styles ------------------------------------------------------------------

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
  redirectHint: {
    marginTop: 6,
    fontSize: 13,
    color: C.secondary,
    fontStyle: 'italic',
  },
  punycodeHint: {
    marginTop: 6,
    fontSize: 13,
    color: C.redText,
  },
  offlineBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: '#F5D5A3',
  },
  offlineBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.orangeText,
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
  whyToggle: {
    marginTop: 12,
    fontSize: 14,
    color: C.blue,
    textAlign: 'center',
    fontWeight: '500',
  },
  whyBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  whyText: {
    fontSize: 14,
    color: C.label,
    lineHeight: 20,
  },
  whyTip: {
    marginTop: 8,
    fontSize: 13,
    color: C.secondary,
    lineHeight: 18,
  },
  stickerBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  stickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  stickerText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  goodCallBox: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  goodCallCheck: {
    fontSize: 56,
    color: '#1B873F',
    fontWeight: '700',
    marginBottom: 12,
  },
  goodCallTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.label,
    marginBottom: 6,
  },
  autoOpenHint: {
    marginTop: 20,
    fontSize: 14,
    color: C.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  goodCallText: {
    fontSize: 15,
    color: C.secondary,
    textAlign: 'center',
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
    overflow: 'hidden',
  },
  reportLabelStack: {
    position: 'relative',
    minHeight: 20,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
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
  btnFlex: {
    flex: 1,
  },
  reportContainer: {
    alignSelf: 'stretch',
  },
  button: {
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
