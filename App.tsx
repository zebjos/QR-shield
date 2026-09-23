import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { DebugSettingsProvider } from './src/debug/DebugSettingsContext';
import FloatingDebugButton from './src/debug/FloatingDebugButton';
import type { RootStackParamList } from './src/navigation/types';
import ScannerScreen from './src/screens/ScannerScreen';
import ResultScreen from './src/screens/ResultScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <DebugSettingsProvider>
      <View style={{ flex: 1 }}>
        <NavigationContainer>
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
              options={{ title: 'Link Check', headerBackVisible: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
        <FloatingDebugButton />
      </View>
    </DebugSettingsProvider>
  );
}
