import { useRef, useState } from 'react';
import { Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';

import { useDebugSettings } from './DebugSettingsContext';
import DebugSettingsSheet from './DebugSettingsSheet';

const BUTTON_SIZE = 52;
const TAP_THRESHOLD = 6;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const START_X = SCREEN_WIDTH - BUTTON_SIZE - 16;
const START_Y = SCREEN_HEIGHT - BUTTON_SIZE - 160;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function FloatingDebugButton() {
  const { buttonVisible } = useDebugSettings();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [position, setPosition] = useState({ x: START_X, y: START_Y });
  const dragStart = useRef(position);
  const moved = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = position;
        moved.current = 0;
      },
      onPanResponderMove: (_, gesture) => {
        moved.current = Math.abs(gesture.dx) + Math.abs(gesture.dy);
        setPosition({
          x: clamp(dragStart.current.x + gesture.dx, 0, SCREEN_WIDTH - BUTTON_SIZE),
          y: clamp(dragStart.current.y + gesture.dy, 0, SCREEN_HEIGHT - BUTTON_SIZE),
        });
      },
      onPanResponderRelease: () => {
        // A short drag distance is a tap, not a drag — open the sheet.
        if (moved.current < TAP_THRESHOLD) {
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
      <View
        style={[styles.button, { left: position.x, top: position.y }]}
        {...panResponder.panHandlers}
      >
        <Text style={styles.icon}>{'⚙️'}</Text>
      </View>
      <DebugSettingsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'rgba(30,30,30,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 1000,
  },
  icon: {
    fontSize: 24,
  },
});
