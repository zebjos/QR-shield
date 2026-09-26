import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { DebugSettingsProvider } from './src/debug/DebugSettingsContext';
import FloatingDebugButton from './src/debug/FloatingDebugButton';
import { navigationRef } from './src/navigation/navigationRef';
import type { RootStackParamList } from './src/navigation/types';
import ScannerScreen from './src/screens/ScannerScreen';
import ResultScreen from './src/screens/ResultScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <DebugSettingsProvider>
      <View style={{ flex: 1 }}>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="light" />
          <Stack.Navigator initialRouteName="Scanner">
            <Stack.Screen
              name="Scanner"
              component={ScannerScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Result"
              component={ResultScreen}
              options={{
                headerShown: false,
                presentation: 'transparentModal',
                animation: 'slide_from_bottom',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
        <FloatingDebugButton />
      </View>
    </DebugSettingsProvider>
  );
}
