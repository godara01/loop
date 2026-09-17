/** The categories feature's public surface. Import from here, never from a deep path. */
export type { CategoriesSnapshot } from './api/category-repository';
export { type CategoriesState, useCategories } from './hooks/use-categories';
export { CatalogueScreen, type CatalogueReturnTo } from './screens/catalogue-screen';
export { CategoryEditorScreen } from './screens/category-editor-screen';
export { ManageCategoriesScreen } from './screens/manage-categories-screen';
