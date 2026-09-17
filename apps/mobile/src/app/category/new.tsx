import { useLocalSearchParams } from 'expo-router';

import { CategoryEditorScreen } from '@/features/categories';

export default function NewCategory() {
  const { fromEntry } = useLocalSearchParams<{ fromEntry?: string }>();
  return <CategoryEditorScreen fromEntry={fromEntry === '1'} />;
}
