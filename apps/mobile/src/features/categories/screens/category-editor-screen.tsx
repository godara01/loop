/**
 * Create and edit share one sheet, the same way the expense entry sheet does.
 * See docs/04-categories.md#tier-3--custom.
 */

import {
  type Category,
  type CategoryColorToken,
  type CategoryIcon,
  MAX_CATEGORY_NAME_LENGTH,
  colors,
  layout,
  newCustomCategory,
  radius,
  slugifyCategoryName,
  space,
  type,
  validateCategoryDraft,
} from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useDraftStore } from '@/core/state/draft-store';
import { useCategories } from '@/features/categories';
import { haptic } from '@/lib/haptics';

import { pickCategoryLogo } from '../api/logo-picker';
import { deleteCategory, newCategoryId, saveCategory, uploadCategoryLogo } from '../api/category-repository';
import { CategoryTagPreview } from '../components/category-tag-preview';
import { ColorTokenPicker } from '../components/color-token-picker';
import { GlyphGrid } from '../components/glyph-grid';

const ERROR_MESSAGES: Record<string, string> = {
  name_empty: 'Give it a name.',
  name_too_long: `Keep it under ${MAX_CATEGORY_NAME_LENGTH} characters.`,
  slug_empty: 'The tag can’t be empty.',
  slug_too_long: 'The tag is too long for a ledger row.',
  slug_taken: 'You already have a category with that tag.',
};

export function CategoryEditorScreen({
  categoryId,
  fromEntry = false,
  viaCatalogue = false,
}: {
  /** Undefined for create; set for edit. */
  categoryId?: string;
  /** Opened from the "+" in the expense sheet — return with the new category selected. */
  fromEntry?: boolean;
  /**
   * Opened from the catalogue's "Create your own" footer. Saving finishes the
   * user's "add a category" task, so it returns past the catalogue — to Manage,
   * or to the entry sheet — instead of back into a (usually empty) search.
   */
  viaCatalogue?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { uid } = useSession();
  const categoriesState = useCategories();
  const updateDraft = useDraftStore((s) => s.update);

  const categories = categoriesState.status === 'ready' ? categoriesState.snapshot.categories : [];
  const editing = categoryId ? categories.find((c) => c.id === categoryId) : undefined;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [icon, setIcon] = useState<CategoryIcon>({ kind: 'glyph', name: 'pricetag' });
  const [colorToken, setColorToken] = useState<CategoryColorToken>('lime');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Generated once, up front, so a picked logo has a real category id to
  // upload against before the document exists — mirrors newExpenseId.
  const [pendingId] = useState(() => newCategoryId(uid));

  // Pre-fill once the category to edit has loaded.
  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setSlug(editing.slug);
    setSlugTouched(true);
    setIcon(editing.icon);
    setColorToken(editing.colorToken);
  }, [editing]);

  const existingForValidation = useMemo(
    () => categories.map((c) => ({ id: c.id, slug: c.slug })),
    [categories],
  );

  const onNameChange = (next: string) => {
    setName(next);
    if (!slugTouched) setSlug(slugifyCategoryName(next));
  };

  const onPickLogo = async () => {
    haptic('tap');
    setUploadingLogo(true);
    setError(null);
    try {
      const result = await pickCategoryLogo();
      if (result.status === 'canceled') return;
      if (result.status === 'rejected') {
        haptic('warning');
        setError(result.reason === 'too_large' ? 'That image is too large.' : 'Pick a PNG, JPEG or WebP image.');
        return;
      }
      // Render the local file immediately; the upload happens in the background
      // and the path is swapped in once it lands (see onSave).
      setIcon({ kind: 'image', path: result.localUri, fallbackGlyph: icon.kind === 'glyph' ? icon.name : 'pricetag' });
      haptic('selection');
    } catch (failure) {
      haptic('error');
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setUploadingLogo(false);
    }
  };

  const onSave = async () => {
    const validation = validateCategoryDraft({ name, slug }, existingForValidation, editing?.id ?? null);
    if (validation) {
      haptic('warning');
      setError(ERROR_MESSAGES[validation] ?? validation);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim().toUpperCase();

      // Written with whatever icon is on hand right now — a freshly-picked
      // logo is still a local file:// path at this point, which renders
      // immediately and needs no network. This is what makes creating a
      // category with a logo work fully offline (docs/04-categories.md).
      const category: Category = editing
        ? { ...editing, name: trimmedName, slug: trimmedSlug, icon, colorToken }
        : newCustomCategory(
            { name: trimmedName, slug: trimmedSlug, icon, colorToken },
            { id: pendingId, sortOrder: categories.length, createdAt: new Date().toISOString() },
          );

      await saveCategory(uid, category);
      if (fromEntry && !editing) updateDraft({ categoryId: category.id });
      haptic('splitConfirm');
      if (viaCatalogue && !editing) router.dismiss(2);
      else router.back();

      // The upload itself is never awaited before leaving the screen — only
      // Firestore's write queues offline, Storage's does not. Once it lands,
      // the document is updated in place to the real Storage path; if it
      // never does, the local file keeps rendering the logo regardless.
      if (icon.kind === 'image' && icon.path.startsWith('file://')) {
        uploadCategoryLogo(uid, category.id, icon.path)
          .then(({ path }) => saveCategory(uid, { ...category, icon: { ...icon, path } }))
          .catch((failure: unknown) => console.warn('[categories] logo upload failed', failure));
      }
    } catch (failure) {
      haptic('error');
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!editing) return;
    haptic('warning');
    Alert.alert('Delete this category?', editing.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptic('destructive');
          deleteCategory(uid, editing.id)
            .then(() => router.back())
            .catch((failure: unknown) => {
              haptic('error');
              setError(failure instanceof Error ? failure.message : String(failure));
            });
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.base }]}>
      <View style={styles.header}>
        <Pressable testID="editor-close" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>{editing ? 'EDIT CATEGORY' : 'NEW CATEGORY'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <CategoryTagPreview name={name} slug={slug} icon={icon} colorToken={colorToken} />

        {error ? (
          <Text testID="editor-error" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <TextInput
          testID="editor-name"
          value={name}
          onChangeText={onNameChange}
          placeholder="Category name"
          placeholderTextColor={colors.textMuted}
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          style={styles.input}
        />

        <View style={styles.slugRow}>
          <Text style={styles.slugLabel}>TAG</Text>
          <TextInput
            testID="editor-slug"
            value={slug}
            onChangeText={(next) => {
              setSlugTouched(true);
              setSlug(slugifyCategoryName(next));
            }}
            autoCapitalize="characters"
            placeholder="TAG"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.slugInput]}
          />
        </View>

        <Text style={styles.sectionLabel}>ICON</Text>
        <Pressable testID="editor-upload-logo" accessibilityRole="button" accessibilityLabel="Upload a logo" onPress={onPickLogo} disabled={uploadingLogo} style={styles.uploadRow}>
          <Ionicons name="image-outline" size={16} color={colors.credit} />
          <Text style={styles.uploadText}>{uploadingLogo ? 'Preparing…' : 'Upload your own logo'}</Text>
        </Pressable>
        <GlyphGrid
          selected={icon.kind === 'glyph' ? icon.name : ''}
          onSelect={(glyph) => setIcon({ kind: 'glyph', name: glyph })}
        />

        <Text style={styles.sectionLabel}>COLOUR</Text>
        <ColorTokenPicker selected={colorToken} onSelect={setColorToken} />

        {editing ? (
          <Pressable testID="editor-delete" accessibilityRole="button" accessibilityLabel="Delete category" onPress={onDelete} style={styles.deleteRow}>
            <Ionicons name="trash-outline" size={16} color={colors.debit} />
            <Text style={styles.deleteText}>Delete category</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <TactileButton testID="editor-save" label={saving ? 'Saving…' : 'Save'} fullWidth disabled={saving} onPress={onSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenMargin },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  headerSpacer: { width: 26 },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  body: { gap: space.md, paddingBottom: space.base },
  error: { ...type.bodySm, color: colors.debit },
  input: {
    ...type.bodyLg,
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.md,
  },
  slugRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  slugLabel: { ...type.monoSm, color: colors.textMuted, width: 32 },
  slugInput: { flex: 1, ...type.monoMd },
  sectionLabel: { ...type.monoSm, color: colors.textMuted, marginTop: space.sm },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  uploadText: { ...type.bodySm, color: colors.credit },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg, alignSelf: 'center' },
  deleteText: { ...type.bodySm, color: colors.debit },
});
