import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { colors } from '@loop/shared';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/core/providers/auth-provider';
import { BootstrapProvider, useSession } from '@/core/providers/bootstrap-provider';
import { SettingsProvider } from '@/core/providers/settings-provider';
import { determineResumeStep } from '@/features/onboarding';
import { initAppCheck } from '@/lib/app-check';

SplashScreen.preventAutoHideAsync();
// Before any Firebase call, so the first callable already carries a token. Never throws.
void initAppCheck();

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { profile } = useSession();
  const segments = useSegments();

  useEffect(() => {
    const segList = segments as string[];
    const inOnboarding = segList[0] === 'onboarding';

    if (!profile.onboardedAt && !inOnboarding) {
      const step = determineResumeStep(profile);
      if (step === 'welcome') {
        router.replace('/onboarding' as any);
      } else if (step === 'feel') {
        router.replace('/onboarding/feel' as any);
      } else {
        router.replace('/onboarding' as any);
      }
    } else if (profile.onboardedAt && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [profile, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <BootstrapProvider onSettled={hideSplash}>
            <SettingsProvider>
              <OnboardingGate>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                  }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="onboarding/index" />
                  <Stack.Screen name="onboarding/profile" />
                  <Stack.Screen name="onboarding/feel" />
                  <Stack.Screen name="onboarding/categories" />
                  <Stack.Screen name="onboarding/first-expense" />
                  <Stack.Screen name="expense/new" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="expense/[id]" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="category/catalogue" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="category/new" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="category/[id]" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="category/index" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="day/[date]" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="coins" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="inbox" />
                  <Stack.Screen name="expense/approve/[pendingId]" options={{ presentation: 'modal' }} />
                </Stack>
              </OnboardingGate>
            </SettingsProvider>
          </BootstrapProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
