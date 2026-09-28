import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
} from '@expo-google-fonts/outfit';
import { AnimatedSplash } from './src/components/AnimatedSplash';
import { RootNavigator } from './src/navigation/RootNavigator';
import { PlayerProvider } from './src/hooks/usePlayer';
import { LibraryProvider } from './src/hooks/useLibrary';
import { COLORS } from './src/constants/theme';
import { getPlatformInfo, isNoteNativeAvailable } from './modules/note-native';

// Keep the native splash up until AnimatedSplash has drawn the identical logo
// frame (it calls hideAsync via onLogoDrawn), so the hand-off has no flash.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const hideNativeSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  // Proof-of-connection for the Android native module. Dev-only, no UI impact.
  useEffect(() => {
    if (__DEV__) {
      console.log(
        '[NoteNative] available:',
        isNoteNativeAvailable(),
        'getPlatformInfo():',
        getPlatformInfo()
      );
    }
  }, []);

  // Aurix's brand font. Screens reference FONTS.* from constants/theme.ts,
  // which only resolves once these are loaded — block first paint on this
  // (background stays COLORS.background so there's no white flash) rather
  // than letting screens render with a wrong fallback font for one frame.
  const [fontsLoaded] = useFonts({
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black,
  });

  return (
    <SafeAreaProvider>
      <View style={styles.webWrapper}>
        {fontsLoaded && (
          <LibraryProvider>
            <PlayerProvider>
              <View style={styles.appContainer}>
                <RootNavigator />
                <StatusBar style="light" />
              </View>
            </PlayerProvider>
          </LibraryProvider>
        )}
        {!splashDone && (
          <AnimatedSplash ready={fontsLoaded} onFinish={finishSplash} onLogoDrawn={hideNativeSplash} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  webWrapper: {
    flex: 1,
    backgroundColor: '#000000', // Darker background for the empty space on desktop
    alignItems: 'center',
    justifyContent: 'center',
  },
  appContainer: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 420 : '100%',
    maxHeight: Platform.OS === 'web' ? 900 : '100%',
    backgroundColor: COLORS.background,
    overflow: 'hidden',
    // Add subtle borders and rounded corners to look like a phone screen on Web
    borderWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Platform.OS === 'web' ? 40 : 0,
  }
});
