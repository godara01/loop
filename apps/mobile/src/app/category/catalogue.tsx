import { useLocalSearchParams } from 'expo-router';

import { CatalogueScreen, type CatalogueReturnTo } from '@/features/categories';

export default function Catalogue() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: CatalogueReturnTo }>();
  return <CatalogueScreen returnTo={returnTo === 'entry' ? 'entry' : 'manage'} />;
}
