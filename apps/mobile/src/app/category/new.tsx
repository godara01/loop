import { useLocalSearchParams } from 'expo-router';

import { CategoryEditorScreen } from '@/features/categories';

export default function NewCategory() {
  const { fromEntry, viaCatalogue } = useLocalSearchParams<{ fromEntry?: string; viaCatalogue?: string }>();
  return <CategoryEditorScreen fromEntry={fromEntry === '1'} viaCatalogue={viaCatalogue === '1'} />;
}
