import type { OnboardingStep } from '@loop/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useSettings } from '@/core/providers/settings-provider';

/**
 * Records the step on screen so a relaunch resumes here (docs/02).
 *
 * Only while focused: the stack keeps earlier steps mounted, and two mounted
 * steps each "correcting" the record would write back and forth forever.
 * Waits for settings to load: `update` writes the whole document, and writing
 * the defaults over the real settings would lose them.
 */
export function useRecordOnboardingStep(step: OnboardingStep): void {
  const { settings, loaded, update } = useSettings();
  const recorded = settings.onboardingStep;
  useFocusEffect(
    useCallback(() => {
      if (loaded && recorded !== step) update({ onboardingStep: step });
      // `update` is recreated every render; the step only needs writing once.
    }, [loaded, recorded, step]),
  );
}
