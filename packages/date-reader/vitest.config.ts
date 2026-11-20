import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The domain's option limits are read from their TypeScript sources, without building them first.
  ssr: { resolve: { conditions: ['@qando/source'] } },
});
