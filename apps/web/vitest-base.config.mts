import { defineConfig } from 'vitest/config';

// Extra Vitest settings for `ng test`. Workspace packages are tested from their TypeScript
// sources, as in the build, without building them first.
export default defineConfig({
  resolve: { conditions: ['@qando/source'] },
});
