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
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/core/providers/auth-provider';
import { BootstrapProvider, useSession } from '@/core/providers/bootstrap-provider';
import { SettingsProvider, useSettings } from '@/core/providers/settings-provider';
import { UpdateGate } from '@/core/update-gate/update-gate';
import { ONBOARDING_ROUTES, determineResumeStep } from '@/features/onboarding';
import { initAppCheck } from '@/lib/app-check';
import { initCrashlytics } from '@/lib/crashlytics';

SplashScreen.preventAutoHideAsync();
// Before any Firebase call, so the first callable already carries a token. Never throws.
void initAppCheck();
// Collection is enabled only outside __DEV__; see lib/crashlytics.ts. Never throws.
initCrashlytics();

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { profile } = useSession();
  const { settings, loaded } = useSettings();
  const segments = useSegments();
  const segList = segments as string[];
  const inOnboarding = segList[0] === 'onboarding';
  // Steps 3 and 5 open the category catalogue and editor as modals over onboarding.
  const onboardingModal = segList[0] === 'category' && (segList[1] === 'new' || segList[1] === 'catalogue');
  // Until settings load we don't know the step to resume at; cover the tabs
  // rather than flash them (docs/02: no route to the tabs before onboardedAt).
  const holding = !profile.onboardedAt && !inOnboarding && !onboardingModal;

  useEffect(() => {
    if (holding) {
      if (!loaded) return;
      const step = determineResumeStep(profile, settings.onboardingStep);
      router.replace((step === 'complete' ? ONBOARDING_ROUTES.welcome : ONBOARDING_ROUTES[step]) as never);
    } else if (profile.onboardedAt && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [holding, loaded, profile, inOnboarding, settings.onboardingStep]);

  return (
    <>
      {children}
      {holding ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} /> : null}
    </>
  );
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
              <UpdateGate>
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
                    <Stack.Screen name="ledger/filter" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="coins" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="accounts/index" />
                    <Stack.Screen name="accounts/[id]/index" />
                    <Stack.Screen name="accounts/new" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="accounts/[id]/edit" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="inbox" />
                    <Stack.Screen name="settings/reset" />
                    <Stack.Screen name="settings/auto-capture" />
                    <Stack.Screen name="expense/approve/[pendingId]" options={{ presentation: 'modal' }} />
                  </Stack>
                </OnboardingGate>
              </UpdateGate>
            </SettingsProvider>
          </BootstrapProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
