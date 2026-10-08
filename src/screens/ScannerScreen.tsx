import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

// ponytail: screenshot mode — camera disabled, static restaurant backdrop
// so demo screens don't leak the dev's real camera feed. Swap this file
// back to the CameraView version to re-enable scanning.
const BG_URL = 'https://picsum.photos/seed/qrshield-restaurant/800/1600';

export default function ScannerScreen(_: Props) {
  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: BG_URL }}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <View style={styles.frame} />
          <Text style={styles.instruction}>Point at a QR code</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const FRAME_SIZE = 260;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bg: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
});
