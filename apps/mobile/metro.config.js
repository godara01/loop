// Metro config for the Loop monorepo.
// Watches the workspace root so `@loop/shared` hot-reloads like local source.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Hierarchical lookup stays ON. npm hoists most deps to the workspace root but
// leaves nested copies where versions conflict — Reanimated, for instance, needs
// its own semver@7 because the root has semver@6. Disabling the walk-up (correct
// for pnpm) makes those nested copies unresolvable.

// Never crawl other agents' git worktrees (each has its own full node_modules,
// which crashes the file watcher) or the Cloud Functions build output.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  new RegExp(`^${escapeRegExp(path.join(workspaceRoot, '.opencodework'))}(/|$)`),
  new RegExp(`^${escapeRegExp(path.join(workspaceRoot, 'functions', 'lib'))}(/|$)`),
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = config;
