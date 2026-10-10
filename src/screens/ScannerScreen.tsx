import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { Logo } from '../components/Logo';
import { pickAndDecodeQr } from '../scanner/pickImage';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

export default function ScannerScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isFocused, setIsFocused] = useState(true);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Reset the scan lock whenever this screen regains focus (e.g. coming back
  // from the Result sheet via Cancel), and pause the camera while the Result
  // sheet is covering it.
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      scannedRef.current = false;
      setIsFocused(true);
    });
    const unsubBlur = navigation.addListener('blur', () => {
      setIsFocused(false);
    });
    return () => {
      unsubFocus();
      unsubBlur();
    };
  }, [navigation]);

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (scannedRef.current || !data) return;
      scannedRef.current = true;
      // Pass the raw QR payload — ResultScreen parses URL / SMS / tel /
      // mailto / WIFI itself.
      navigation.navigate('Result', { url: data });
    },
    [navigation]
  );

  const handleImportImage = useCallback(async () => {
    try {
      const payload = await pickAndDecodeQr();
      if (!payload) return;
      scannedRef.current = true;
      navigation.navigate('Result', { url: payload });
    } catch (e) {
      Alert.alert('Scan failed', e instanceof Error ? e.message : String(e));
    }
  }, [navigation]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionBox]}>
        <Text style={styles.permissionText}>
          QR Shield needs camera access to scan QR codes.
        </Text>
        <Button title="Grant Camera Access" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        active={isFocused}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="none">
          <Logo size={28} ink="#fff" beam="#2563EB" />
          <Text style={styles.wordmark}>QR Shield</Text>
        </View>
        <View style={styles.frame} pointerEvents="none" />
        <Text style={styles.instruction} pointerEvents="none">
          Point at a QR code
        </Text>
        <Pressable style={styles.importButton} onPress={handleImportImage}>
          <Text style={styles.importButtonText}>Import from photos</Text>
        </Pressable>
      </View>
    </View>
  );
}

const FRAME_SIZE = 260;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 24,
  },
  instruction: {
    position: 'absolute',
    bottom: 80,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 32,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  permissionBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 32,
  },
  importButton: {
    position: 'absolute',
    bottom: 36,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
