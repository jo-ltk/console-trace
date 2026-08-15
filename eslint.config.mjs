import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['node_modules/**', 'dist/**', '.expo/**', 'artifacts/**', 'src/app/**', 'src/components/**', 'src/stores/**', 'src/services/**'],
  },
  {
    files: ['server/**/*.ts', 'test-fixture/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
