import { colors, layout, radius, space, type } from '@loop/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TactileButton } from '@/components/ui/tactile-button';
import { haptic } from '@/lib/haptics';

import { usePasteParse } from '../hooks/use-paste-parse';

/**
 * Paste a bank message; on success it lands in the inbox like any captured
 * one. Nothing is created from text the parser can't read.
 */
export function PasteSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const parse = usePasteParse();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    // The pasted text is never kept once the sheet closes.
    setText('');
    setError(null);
    onClose();
  };

  const submit = () => {
    const result = parse(text);
    if (!result.ok) {
      haptic('warning');
      setError(result.message);
      return;
    }
    haptic('press');
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.base }]} testID="paste-sheet">
          <Text style={styles.eyebrow}>PASTE A MESSAGE</Text>
          <Text style={styles.help}>Copy a transaction SMS from your bank and paste it here.</Text>
          <TextInput
            testID="paste-input"
            accessibilityLabel="Bank message"
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (error) setError(null);
            }}
            placeholder="Rs.450.00 spent on …"
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
            style={styles.input}
          />
          {error ? (
            <Text testID="paste-error" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <TactileButton testID="paste-cancel" label="Cancel" variant="secondary" style={styles.action} onPress={close} />
            <TactileButton
              testID="paste-submit"
              label="Read it"
              disabled={text.trim() === ''}
              style={styles.action}
              onPress={submit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    gap: space.md,
    padding: layout.screenMargin,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  help: { ...type.bodyMd, color: colors.textMuted },
  input: {
    ...type.monoMd,
    minHeight: 120,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.control,
    padding: space.md,
  },
  error: { ...type.bodyMd, color: colors.debit },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
});
