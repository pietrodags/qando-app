// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Modules the shared packages (`packages/*`) must not import, as regular expressions on the module
// specifier, each with the reason shown by lint.
const sharedPackageBoundaries = [
  {
    regex: '^express(/.*)?$',
    message: 'HTTP belongs to apps/api; shared packages stay framework-free.',
  },
  {
    regex: '^@angular/',
    message: 'Angular belongs to apps/web; shared packages stay framework-free.',
  },
  {
    regex: '^(drizzle-orm|pg)(/.*)?$',
    message: 'The database belongs to apps/api; repositories are its only bridge.',
  },
  {
    regex: '^better-auth(/.*)?$',
    message: 'Authentication belongs to apps/api.',
  },
  {
    regex: '^@qando/(api|web)(/.*)?$|(^|/)apps/',
    message: 'Shared packages must not depend on an app; the apps depend on them.',
  },
];

// A type assertion on top of another (`x as unknown as T`, `<T>(<unknown>x)`) invents a type the
// compiler cannot check. `as const` underneath is allowed: it only narrows. Shared by every block
// that sets `no-restricted-syntax`, since a later block replaces the rule's options.
const assertion = ':matches(TSAsExpression, TSTypeAssertion)';
const notAsConst =
  ":not([typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='const'])";
const chainedAssertions = [
  {
    selector: `${assertion} > ${assertion}.expression${notAsConst}`,
    message:
      'Do not chain type assertions: parse data from outside with Zod instead, or build a value that really has the type (a class that implements the interface).',
  },
];

// Vitest calls that replace a whole module, so a test can pass while the real piece is broken.
const moduleMocks = ['mock', 'doMock', 'unstable_mockModule'].map((property) => ({
  object: 'vi',
  property,
  message:
    'Do not mock modules: inject the collaborator instead, and replace only the edges (ports, clock, external services).',
}));

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
      'no-restricted-properties': ['error', ...moduleMocks],
      'no-restricted-syntax': ['error', ...chainedAssertions],
    },
  },

  // Node packages: API, domain, contracts and the acceptance tests.
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Shared packages: qando's rules and the shape on the wire, free of frameworks, the database
  // and the apps, so both apps can use them and the domain stays pure. Static imports, re-exports,
  // `import x = require()` and dynamic `import()` are all checked against the same groups.
  {
    files: ['packages/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: sharedPackageBoundaries }],
      'no-restricted-syntax': [
        'error',
        ...chainedAssertions,
        ...sharedPackageBoundaries.map(({ regex, message }) => ({
          selector: `ImportExpression[source.value=/${regex.replaceAll('/', '\\/')}/]`,
          message,
        })),
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
      // The Angular 22 best-practices guide, where a linter can check it (the rest is judged in
      // code review): signal inputs, outputs, queries and model(); the host object instead of
      // decorators; computed() that returns; signals called, not referenced.
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-signal-model': 'error',
      '@angular-eslint/prefer-output-emitter-ref': 'error',
      '@angular-eslint/prefer-output-readonly': 'error',
      '@angular-eslint/prefer-host-metadata-property': 'error',
      '@angular-eslint/computed-must-return': 'error',
      '@angular-eslint/no-uncalled-signals': 'error',
      // Templates stay inline while short; longer ones go to a .html file beside the component.
      '@angular-eslint/component-max-inline-declarations': ['error', { template: 30 }],
      '@angular-eslint/relative-url-prefix': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@angular/common',
              importNames: ['CommonModule'],
              message: 'Import only the directives and pipes the template uses.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // Class and style bindings instead of ngClass / ngStyle; NgOptimizedImage for images.
      '@angular-eslint/template/prefer-class-binding': 'error',
      '@angular-eslint/template/prefer-style-binding': 'error',
      '@angular-eslint/template/prefer-ngsrc': 'error',
    },
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
