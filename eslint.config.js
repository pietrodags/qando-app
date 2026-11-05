// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    '**/.angular/',
    '**/reports/',
    '**/.features-gen/',
    '**/test-results/',
    '**/playwright-report/',
  ]),

  // Every TypeScript file: type-aware rules, so promises and `any` are checked.
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  // Node packages: API, domain, contracts and the acceptance tests.
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Shared packages: qando's rules and the shape on the wire, free of frameworks, the database
  // and the apps, so both apps can use them and the domain stays pure.
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['express', 'express/*'],
              message: 'HTTP belongs to apps/api; shared packages stay framework-free.',
            },
            {
              group: ['@angular/*'],
              message: 'Angular belongs to apps/web; shared packages stay framework-free.',
            },
            {
              group: ['drizzle-orm', 'drizzle-orm/*', 'pg', 'pg/*'],
              message: 'The database belongs to apps/api; repositories are its only bridge.',
            },
            {
              group: ['better-auth', 'better-auth/*'],
              message: 'Authentication belongs to apps/api.',
            },
            {
              group: ['@qando/api', '@qando/api/*', '@qando/web', '@qando/web/*', '**/apps/**'],
              message: 'Shared packages must not depend on an app; the apps depend on them.',
            },
          ],
        },
      ],
    },
  },

  // Angular web: components and templates.
  {
    files: ['apps/web/**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      // Angular 22: OnPush is the default, so neither restating it nor opting out of it.
      '@angular-eslint/prefer-on-push-component-change-detection': [
        'error',
        { allowExplicitOnPush: false },
      ],
      // Angular 22: root singletons use `@Service()`.
      '@angular-eslint/prefer-service-decorator': 'error',
    },
  },
  {
    files: ['apps/web/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },

  // Tests stub collaborators (`async () => value`, a promise that never settles) and assert on
  // values they just set up.
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Config files at the root are plain JavaScript.
  {
    files: ['**/*.js'],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Formatting belongs to Prettier.
  prettier,
);
