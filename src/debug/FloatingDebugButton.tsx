import { useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, View } from 'react-native';

import { useDebugSettings } from './DebugSettingsContext';
import DebugSettingsSheet from './DebugSettingsSheet';

const BUTTON_SIZE = 52;
const TAP_THRESHOLD = 4;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const START_X = SCREEN_WIDTH - BUTTON_SIZE - 16;
const START_Y = SCREEN_HEIGHT - BUTTON_SIZE - 160;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function FloatingDebugButton() {
  const { buttonVisible } = useDebugSettings();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pan = useRef(new Animated.ValueXY({ x: START_X, y: START_Y })).current;
  // Our own bookkeeping of the button's position, kept in refs so the
  // PanResponder callbacks (created once) always see the latest value
  // instead of a value captured from whichever render created them.
  const currentPosition = useRef({ x: START_X, y: START_Y });
  const dragStart = useRef({ x: START_X, y: START_Y });
  const totalMovement = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        totalMovement.current = 0;
        dragStart.current = currentPosition.current;
      },
      onPanResponderMove: (_event, gesture) => {
        totalMovement.current = Math.abs(gesture.dx) + Math.abs(gesture.dy);
        const next = {
          x: clamp(dragStart.current.x + gesture.dx, 0, SCREEN_WIDTH - BUTTON_SIZE),
          y: clamp(dragStart.current.y + gesture.dy, 0, SCREEN_HEIGHT - BUTTON_SIZE),
        };
        currentPosition.current = next;
        pan.setValue(next);
      },
      onPanResponderRelease: () => {
        // A short drag distance is a tap, not a drag — open the sheet.
        if (totalMovement.current < TAP_THRESHOLD) {
          setSheetOpen(true);
        }
      },
    })
  ).current;

  if (!buttonVisible) {
    return null;
  }

  return (
    <>
      <Animated.View
        style={[styles.button, { transform: pan.getTranslateTransform() }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.dotsRow}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </Animated.View>
      <DebugSettingsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'rgba(28,28,30,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 1000,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.9)',
    marginHorizontal: 2,
  },
});
