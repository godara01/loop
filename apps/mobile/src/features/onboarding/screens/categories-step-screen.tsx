/**
 * Step 4 — Categories. Pick essentials, add custom or catalogue.
 * See docs/02-onboarding.md#step-4--categories.
 */

import {
  archiveCategory,
  categoryColors,
  colors,
  layout,
  space,
  type,
  unarchiveCategory,
} from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { saveCategory } from '@/features/categories/api/category-repository';
import { useCategories } from '@/features/categories/hooks/use-categories';
import { haptic } from '@/lib/haptics';

export function CategoriesStepScreen() {
  const insets = useSafeAreaInsets();
  const { uid } = useSession();
  const categoriesState = useCategories();

  const categories = categoriesState.status === 'ready' ? categoriesState.snapshot.categories : [];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Default all active categories to selected initially
  useEffect(() => {
    if (categories.length > 0 && selectedIds.size === 0) {
      const activeIds = categories.filter((c) => c.archivedAt === null).map((c) => c.id);
      setSelectedIds(new Set(activeIds));
    }
  }, [categories, selectedIds.size]);

  const toggleCategory = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      if (next.size <= 1) {
        haptic('warning');
        return;
      }
      next.delete(id);
    } else {
      next.add(id);
    }
    haptic('selection');
    setSelectedIds(next);
  };

  const handleContinue = async () => {
    if (selectedIds.size === 0) {
      haptic('warning');
      return;
    }

    try {
      const now = new Date().toISOString();
      for (const cat of categories) {
        const isSelected = selectedIds.has(cat.id);
        if (isSelected && cat.archivedAt !== null) {
          const unarchived = unarchiveCategory(cat);
          await saveCategory(uid, unarchived);
        } else if (!isSelected && cat.archivedAt === null) {
          const archived = archiveCategory(cat, now);
          await saveCategory(uid, archived);
        }
      }
      haptic('press');
      router.push('/onboarding/first-expense' as any);
    } catch (err) {
      console.warn('Category sync error:', err);
      router.push('/onboarding/first-expense' as any);
    }
  };

  return (
    <ScrollView
      testID="screen-onboarding-categories"
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl },
      ]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>STEP 3 OF 4</Text>
        <Text style={styles.title}>Your categories</Text>
        <Text style={styles.subtitle}>
          Choose the categories you want active. You can always change these later.
        </Text>
      </View>

      <View style={styles.categoryGrid}>
        {categories.map((cat) => {
          const isSelected = selectedIds.has(cat.id);
          const tint = categoryColors[cat.colorToken]?.tint || colors.text;

          return (
            <Pressable
              key={cat.id}
              testID={`onboarding-category-${cat.id}`}
              onPress={() => toggleCategory(cat.id)}
              style={[
                styles.categoryChip,
                isSelected && styles.categoryChipSelected,
              ]}>
              <View style={styles.chipContent}>
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={isSelected ? colors.credit : colors.textMuted}
                />
                <Text
                  style={[
                    styles.categorySlug,
                    { color: isSelected ? tint : colors.textMuted },
                  ]}>
                  {cat.slug}
                </Text>
              </View>
              <Text style={styles.categoryName}>{cat.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.moreCard}>
        <View style={styles.moreRow}>
          <Text style={styles.moreText}>Need more or something custom?</Text>
          <View style={styles.moreButtons}>
            <TactileButton
              testID="onboarding-browse-catalogue"
              label="Catalogue"
              variant="secondary"
              onPress={() => router.push('/category/catalogue')}
            />
            <TactileButton
              testID="onboarding-custom-category"
              label="+ New"
              variant="secondary"
              onPress={() => router.push('/category/new')}
            />
          </View>
        </View>
      </Card>

      <View style={styles.footer}>
        <TactileButton
          testID="onboarding-categories-continue"
          label="Continue"
          fullWidth
          disabled={selectedIds.size === 0}
          onPress={handleContinue}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
    gap: space.lg,
  },
  header: { gap: space.xs },
  eyebrow: { ...type.monoSm, color: colors.credit, letterSpacing: 1.5 },
  title: { ...type.headlineLg, color: colors.text },
  subtitle: { ...type.bodyMd, color: colors.textMuted },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  categoryChip: {
    width: '48%',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    padding: space.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  categoryChipSelected: {
    borderColor: colors.credit,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  categorySlug: {
    ...type.monoSm,
    fontWeight: '700',
  },
  categoryName: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  moreCard: {
    gap: space.sm,
  },
  moreRow: {
    gap: space.sm,
  },
  moreText: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  moreButtons: {
    flexDirection: 'row',
    gap: space.sm,
  },
  footer: { marginTop: 'auto', paddingTop: space.md },
});
