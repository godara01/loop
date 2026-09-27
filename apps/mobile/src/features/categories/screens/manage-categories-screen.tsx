/**
 * Active / archived categories, with drag reorder on the active list.
 * See docs/04-categories.md#managing-categoryindex.
 */

import {
  type Category,
  canArchive,
  canDelete,
  categoryColors,
  colors,
  layout,
  radius,
  reorderCategories,
  space,
  type,
} from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useCategories } from '@/features/categories';
import { useRecentExpenses } from '@/features/expenses';
import { haptic } from '@/lib/haptics';

import { archiveCategory as buildArchived, unarchiveCategory as buildUnarchived } from '@loop/shared';
import { deleteCategory, saveCategory, saveCategoryOrder } from '../api/category-repository';
import { CategoryIconView } from '../components/category-icon-view';

function CategoryIconBadge({ category }: { category: Category }) {
  const { tint, onTint } = categoryColors[category.colorToken];
  return (
    <View style={[styles.badge, { backgroundColor: tint }]}>
      <CategoryIconView icon={category.icon} size={32} color={onTint} style={styles.badgeImage} />
    </View>
  );
}

export function ManageCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { uid } = useSession();
  const categoriesState = useCategories();
  // A generous window: this is a count for "is it safe to delete", not a report.
  const recentExpenses = useRecentExpenses(500);

  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const categories = categoriesState.status === 'ready' ? categoriesState.snapshot.categories : [];
  const active = useMemo(
    () => categories.filter((c) => c.archivedAt === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const archived = useMemo(() => categories.filter((c) => c.archivedAt !== null), [categories]);

  const expenseCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    if (recentExpenses.status === 'ready') {
      for (const expense of recentExpenses.snapshot.expenses) {
        counts.set(expense.categoryId, (counts.get(expense.categoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [recentExpenses]);

  const report = (failure: unknown) => {
    haptic('error');
    setError(failure instanceof Error ? failure.message : String(failure));
  };

  const onArchive = (category: Category) => {
    haptic('warning');
    saveCategory(uid, buildArchived(category, new Date().toISOString())).catch(report);
  };

  const onUnarchive = (category: Category) => {
    haptic('tap');
    saveCategory(uid, buildUnarchived(category)).catch(report);
  };

  const onDelete = (category: Category) => {
    haptic('destructive');
    Alert.alert('Delete this category?', category.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(uid, category.id).catch(report) },
    ]);
  };

  const onDragEnd = ({ data }: { data: Category[] }) => {
    haptic('dragDrop');
    saveCategoryOrder(uid, reorderCategories(data.map((c) => c.id), active)).catch(report);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.base }]}>
      <View style={styles.header}>
        <Pressable testID="manage-close" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>CATEGORIES</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TactileButton
        testID="manage-add"
        label="Add from catalogue"
        variant="secondary"
        fullWidth
        onPress={() => router.push('/category/catalogue')}
        style={styles.addButton}
      />

      <Text style={styles.sectionLabel}>ACTIVE — DRAG TO REORDER</Text>
      <DraggableFlatList
        testID="manage-active-list"
        data={active}
        keyExtractor={(item) => item.id}
        onDragBegin={() => haptic('dragStart')}
        onDragEnd={onDragEnd}
        containerStyle={styles.dragList}
        renderItem={({ item, drag, isActive }: RenderItemParams<Category>) => {
          const count = expenseCountByCategory.get(item.id) ?? 0;
          const deletable = canDelete(item, count);
          return (
            <Pressable
              testID={`manage-row-${item.slug}`}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityHint="Opens the category. Long-press to reorder."
              onLongPress={drag}
              disabled={isActive}
              onPress={() => router.push({ pathname: '/category/[id]', params: { id: item.id } })}
              style={[styles.row, isActive && styles.rowDragging]}>
              <CategoryIconBadge category={item} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name}</Text>
                <MonoTag tint={categoryColors[item.colorToken].tint}>{item.slug}</MonoTag>
              </View>
              {canArchive(item) ? (
                <Pressable
                  testID={`manage-archive-${item.slug}`}
                  accessibilityLabel={`Archive ${item.name}`}
                  hitSlop={10}
                  onPress={() => onArchive(item)}>
                  <Ionicons name="archive-outline" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
              {deletable ? (
                <Pressable
                  testID={`manage-delete-${item.slug}`}
                  accessibilityLabel={`Delete ${item.name}`}
                  hitSlop={10}
                  onPress={() => onDelete(item)}>
                  <Ionicons name="trash-outline" size={18} color={colors.debit} />
                </Pressable>
              ) : null}
            </Pressable>
          );
        }}
      />

      <Pressable testID="manage-toggle-archived" accessibilityRole="button" accessibilityLabel={showArchived ? 'Hide archived categories' : 'Show archived categories'} onPress={() => setShowArchived((v) => !v)} style={styles.archivedToggle}>
        <Text style={styles.archivedToggleText}>
          {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
        </Text>
      </Pressable>

      {showArchived ? (
        <ScrollView style={styles.archivedList}>
          {archived.map((item) => (
            <View key={item.id} testID={`manage-row-${item.slug}`} style={[styles.row, styles.rowArchived]}>
              <CategoryIconBadge category={item} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name}</Text>
                <MonoTag tint={categoryColors[item.colorToken].tint}>{item.slug}</MonoTag>
              </View>
              <Pressable
                testID={`manage-unarchive-${item.slug}`}
                accessibilityLabel={`Unarchive ${item.name}`}
                hitSlop={10}
                onPress={() => onUnarchive(item)}>
                <Ionicons name="arrow-undo-outline" size={18} color={colors.credit} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
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
  addButton: { marginBottom: space.md },
  sectionLabel: { ...type.monoSm, color: colors.textMuted, marginBottom: space.xs },
  dragList: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: space.xs,
  },
  rowDragging: { borderColor: colors.credit },
  rowArchived: { opacity: 0.6 },
  badge: { width: 32, height: 32, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  badgeImage: { borderRadius: radius.control },
  rowInfo: { flex: 1, gap: 4 },
  rowName: { ...type.bodyLg, color: colors.text },
  archivedToggle: { paddingVertical: space.md, alignItems: 'center' },
  archivedToggleText: { ...type.monoSm, color: colors.textMuted },
  archivedList: { maxHeight: 260 },
});
