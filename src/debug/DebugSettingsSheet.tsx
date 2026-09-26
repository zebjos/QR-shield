import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { navigationRef } from '../navigation/navigationRef';
import type { DangerReasonCode, VerdictStatus } from '../verdict/getUrlVerdict';
import { DANGER_REASON_TEXT } from '../verdict/getUrlVerdict';
import { useDebugSettings } from './DebugSettingsContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SIMULATED_URL = 'https://example.com/simulated-qr-scan';

const VERDICT_OPTIONS: { label: string; value: VerdictStatus | null }[] = [
  { label: 'Random (default)', value: null },
  { label: 'Safe', value: 'safe' },
  { label: 'Unknown', value: 'unknown' },
  { label: 'Dangerous', value: 'dangerous' },
];

const REASON_LABELS: Record<DangerReasonCode, string> = {
  brandLookalike: 'Brand lookalike',
  newlyRegisteredDomain: 'New domain',
  reportedPhishing: 'Reported phishing',
  ipAddressHost: 'Raw IP address',
  suspiciousRedirectChain: 'Suspicious redirect',
};

const REASON_OPTIONS: { label: string; value: DangerReasonCode | null }[] = [
  { label: 'Random', value: null },
  ...(Object.keys(DANGER_REASON_TEXT) as DangerReasonCode[]).map((code) => ({
    label: REASON_LABELS[code],
    value: code,
  })),
];

export default function DebugSettingsSheet({ visible, onClose }: Props) {
  const {
    forcedVerdict,
    setForcedVerdict,
    forcedReasonCode,
    setForcedReasonCode,
    hideButton,
  } = useDebugSettings();

  const handleSimulateScan = () => {
    onClose();
    if (navigationRef.isReady()) {
      navigationRef.navigate('Result', { url: SIMULATED_URL });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Debug Settings</Text>
          <Text style={styles.subtitle}>
            {'For testing during development.'}
          </Text>

          <Text style={styles.sectionLabel}>Simulate verdict on next scan</Text>
          {VERDICT_OPTIONS.map((option) => {
            const selected = forcedVerdict === option.value;
            return (
              <Pressable
                key={option.label}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => setForcedVerdict(option.value)}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}

          {forcedVerdict === 'dangerous' ? (
            <>
              <Text style={[styles.sectionLabel, styles.reasonLabel]}>
                Danger reason
              </Text>
              <View style={styles.chipRow}>
                {REASON_OPTIONS.map((option) => {
                  const selected = forcedReasonCode === option.value;
                  return (
                    <Pressable
                      key={option.label}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setForcedReasonCode(option.value)}
                    >
                      <Text
                        style={[styles.chipText, selected && styles.chipTextSelected]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Pressable style={styles.simulateButton} onPress={handleSimulateScan}>
            <Text style={styles.simulateButtonText}>Simulate scan</Text>
          </Pressable>
          <Text style={styles.simulateHint}>
            {'Gives verdict on an example url.'}
          </Text>

          <Pressable
            style={styles.hideButton}
            onPress={() => {
              hideButton();
              onClose();
            }}
          >
            <Text style={styles.hideButtonText}>Hide floating button</Text>
          </Pressable>
          <Text style={styles.hideHint}>Reload the app to bring it back.</Text>

          <Pressable style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginBottom: 8,
  },
  optionSelected: {
    backgroundColor: '#111',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111',
  },
  optionTextSelected: {
    color: '#fff',
  },
  reasonLabel: {
    marginTop: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  chipSelected: {
    backgroundColor: '#111',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111',
  },
  chipTextSelected: {
    color: '#fff',
  },
  simulateButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#111',
  },
  simulateButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  simulateHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 6,
  },
  hideButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#FDECEC',
  },
  hideButtonText: {
    color: '#B91C1C',
    fontWeight: '600',
    fontSize: 15,
  },
  hideHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 6,
  },
  doneButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F1F1F1',
  },
  doneButtonText: {
    color: '#111',
    fontWeight: '600',
    fontSize: 15,
  },
});
