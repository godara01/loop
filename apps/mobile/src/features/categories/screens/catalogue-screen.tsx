/**
 * The browsable catalogue: sectioned, searchable, multi-select, "Add N".
 * See docs/04-categories.md#tier-2--the-catalogue.
 */

import {
  type CatalogueSection,
  type CategoryTemplate,
  catalogueFor,
  categoryColors,
  colors,
  layout,
  radius,
  space,
  type,
} from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useDraftStore } from '@/core/state/draft-store';
import { useCategories } from '@/features/categories';
import { haptic } from '@/lib/haptics';

import { addCategoriesFromCatalogue } from '../api/category-repository';

/** Set by whoever opened the catalogue, so the new pick can be preselected on return. */
export type CatalogueReturnTo = 'entry' | 'manage';

export function CatalogueScreen({ returnTo }: { returnTo: CatalogueReturnTo }) {
  const insets = useSafeAreaInsets();
  const { uid } = useSession();
  const categoriesState = useCategories();
  const updateDraft = useDraftStore((s) => s.update);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const installed = categoriesState.status === 'ready' ? categoriesState.snapshot.categories : [];
  const nextSortOrder = installed.length;

  const sections = useMemo(() => {
    const bySection = catalogueFor(installed);
    const needle = search.trim().toLowerCase();
    const rows: { title: CatalogueSection; data: CategoryTemplate[] }[] = [];
    for (const [section, templates] of bySection) {
      const filtered =
        needle === '' ? templates : templates.filter((t) => t.name.toLowerCase().includes(needle));
      if (filtered.length > 0) rows.push({ title: section, data: filtered });
    }
    return rows;
  }, [installed, search]);

  const toggle = (slug: string) => {
    haptic('selection');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const onAdd = async () => {
    const templates = sections.flatMap((s) => s.data).filter((t) => selected.has(t.slug));
    if (templates.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const created = await addCategoriesFromCatalogue(uid, templates, nextSortOrder);
      haptic('splitConfirm');
      if (returnTo === 'entry' && created[0]) {
        // Preselect the first newly-added category and hand the amount back intact.
        updateDraft({ categoryId: created[0].id });
      }
      router.back();
    } catch (failure) {
      haptic('error');
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.base }]}>
      <View style={styles.header}>
        <Pressable testID="catalogue-close" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>ADD CATEGORIES</Text>
        <View style={styles.headerSpacer} />
      </View>

      <TextInput
        testID="catalogue-search"
        value={search}
        onChangeText={setSearch}
        placeholder="Search the catalogue"
        placeholderTextColor={colors.textMuted}
        style={styles.search}
        returnKeyType="search"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.slug}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title.toUpperCase()}</Text>}
        renderItem={({ item }) => {
          const active = selected.has(item.slug);
          const { tint, onTint } = categoryColors[item.colorToken];
          return (
            <Pressable
              testID={`catalogue-item-${item.slug}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => toggle(item.slug)}
              style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: tint }]}>
                <Ionicons name={item.glyph as keyof typeof Ionicons.glyphMap} size={16} color={onTint} />
              </View>
              <Text style={styles.rowLabel}>{item.name}</Text>
              <View style={[styles.checkbox, active && styles.checkboxActive]}>
                {active ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search ? `No matches for "${search}".` : "You've added everything in the catalogue."}
          </Text>
        }
        ListFooterComponent={
          <Pressable
            testID="catalogue-create-custom"
            accessibilityRole="button"
            accessibilityLabel="Create a custom category"
            onPress={() =>
              router.push(returnTo === 'entry' ? '/category/new?fromEntry=1' : '/category/new')
            }
            style={styles.footerLink}>
            <Text style={styles.footerLinkText}>Can't find it? Create your own →</Text>
          </Pressable>
        }
      />

      {selected.size > 0 ? (
        <TactileButton
          testID="catalogue-add"
          label={saving ? 'Adding…' : `Add ${selected.size} ${selected.size === 1 ? 'category' : 'categories'}`}
          fullWidth
          disabled={saving}
          onPress={onAdd}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenMargin },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  headerSpacer: { width: 26 },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  error: { ...type.bodySm, color: colors.debit, marginBottom: space.xs },
  search: {
    ...type.bodyMd,
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.sm + 2,
    marginBottom: space.sm,
  },
  list: { paddingBottom: space['3xl'] },
  sectionHeader: {
    ...type.monoSm,
    color: colors.textMuted,
    backgroundColor: colors.background,
    paddingVertical: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...type.bodyLg, color: colors.text, flex: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.micro,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.credit, borderColor: colors.credit },
  empty: { ...type.bodyMd, color: colors.textMuted, textAlign: 'center', marginTop: space['3xl'] },
  footerLink: { alignItems: 'center', paddingVertical: space.lg },
  footerLinkText: { ...type.bodySm, color: colors.textMuted },
});
