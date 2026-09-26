import { useEffect, useState } from 'react';
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
import { getUrlVerdict, type Verdict } from '../verdict/getUrlVerdict';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

const STATUS_CONFIG = {
  safe: {
    label: 'SAFE',
    symbol: '✓',
    background: '#1B873F',
  },
  unknown: {
    label: 'UNKNOWN',
    symbol: '?',
    background: '#D97706',
  },
  dangerous: {
    label: 'DANGEROUS',
    symbol: '⚠',
    background: '#DC2626',
  },
} as const;

export default function ResultScreen({ route, navigation }: Props) {
  const { url } = route.params;
  const { forcedVerdict, forcedReasonCode } = useDebugSettings();
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVerdict(null);
    getUrlVerdict(url, forcedVerdict, forcedReasonCode).then((result) => {
      if (!cancelled) {
        setVerdict(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, forcedVerdict, forcedReasonCode]);

  const handleCancel = () => {
    navigation.goBack();
  };

  const handleOpen = () => {
    Linking.openURL(url);
  };

  return (
    <Pressable style={styles.backdrop} onPress={handleCancel}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.grabber} />

        {!verdict ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>{'Checking link…'}</Text>
          </View>
        ) : (
          <>
            <View style={styles.urlBlock}>
              <Text style={styles.urlLabel}>Destination</Text>
              <Text style={styles.url} selectable numberOfLines={3}>
                {url}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_CONFIG[verdict.status].background },
              ]}
            >
              <Text style={styles.statusSymbol}>
                {STATUS_CONFIG[verdict.status].symbol}
              </Text>
              <Text style={styles.statusLabel}>
                {STATUS_CONFIG[verdict.status].label}
              </Text>
            </View>

            {verdict.status === 'dangerous' && verdict.reason ? (
              <Text style={styles.reason}>{verdict.reason}</Text>
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
                onPress={handleOpen}
              >
                <Text style={styles.openButtonText}>Open Website</Text>
              </Pressable>
            </View>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

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
    marginBottom: 24,
  },
  urlLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  url: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111',
  },
  statusBadge: {
    borderRadius: 20,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSymbol: {
    fontSize: 48,
    color: '#fff',
    fontWeight: '700',
  },
  statusLabel: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 8,
  },
  reason: {
    marginTop: 16,
    fontSize: 15,
    color: '#B91C1C',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
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
    color: '#111',
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
});
