import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * Lets code outside the navigator (the debug settings sheet, which is a
 * sibling of NavigationContainer so it can float above every screen) still
 * trigger navigation, e.g. to simulate a scan without the camera.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
