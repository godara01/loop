export * from './money';
export * from './split';
export * from './settle';
export * from './streak';
export * from './categories';
export * from './expenses';
export * from './coins';
export * from './insights';
export * from './rollups';
export * from './types';
export * from './theme';
export * from './firestore';
export * from './storage-paths';

// SMS exports (selective to avoid duplication with types.ts)
export { BANK_SENDER_ENTITIES, isAllowlistedSender, senderEntity } from './sms/sender';
export { isDuplicatePendingExpense } from './sms/dedupe';
export type {
  DedupeCandidate,
  DedupeManualExpense,
  DedupePendingExpense,
} from './sms/dedupe';
export { bankLabel, buildDisplayHint } from './sms/display-hint';
export type { DisplayHintFields } from './sms/display-hint';
export {
  BUNDLED_REGISTRY,
  COMPILED_BUNDLED_REGISTRY,
  compileRegistry,
  mergeRegistry,
  parseTransactionSms,
  SMS_TEMPLATES,
} from './sms/templates';
export type {
  CompiledRegistry,
  CompiledTemplate,
  ParsedTransaction,
  PendingExpenseStatus,
  PendingExpenseSource,
  TemplateFields,
  TemplateRegistry,
  TemplateSpec,
  TransactionDirection,
} from './sms/types';
