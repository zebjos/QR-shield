import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';

import type { VerdictStatus } from './getUrlVerdict';

/**
 * Physical interrupt fired when a scan resolves to "dangerous".
 *
 * Grounded in dual-process theory: scanning a QR code and tapping the
 * resulting link is a fast, habitual System 1 action. A generic UI warning
 * is easy to skim past on the same autopilot. A distinct, multi-pulse buzz
 * that doesn't match any routine UI feedback is meant to act as a salience
 * cue — an interruption forceful enough to push the user into deliberate
 * System 2 evaluation of the warning before they decide whether to open
 * the link.
 *
 * Deliberately does nothing for "safe" / "unknown" so those stay a clean,
 * unstimulated baseline if this is ever used to measure the vibration's
 * effect on decisions.
 *
 * expo-haptics gives iOS's built-in three-pulse "error" pattern via the
 * Taptic Engine. Vibration.vibrate(pattern) is layered in because
 * Android's haptic-feedback constants are often too weak/short to read as
 * a deliberate interrupt, while the Vibration API's pattern support
 * reliably drives the vibration motor directly.
 */
export function triggerDangerVibration(status: VerdictStatus): void {
  if (status !== 'dangerous') {
    return;
  }

  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  Vibration.vibrate([0, 250, 120, 250, 120, 250]);
}
