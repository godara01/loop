/** The categories feature's public surface. Import from here, never from a deep path. */
export type { CategoriesSnapshot } from './api/category-repository';
export { type CategoriesState, useCategories } from './hooks/use-categories';
