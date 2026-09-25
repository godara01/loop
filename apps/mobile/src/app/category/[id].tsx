import { useLocalSearchParams } from 'expo-router';

import { CategoryEditorScreen } from '@/features/categories';

export default function EditCategory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CategoryEditorScreen categoryId={id} />;
}
