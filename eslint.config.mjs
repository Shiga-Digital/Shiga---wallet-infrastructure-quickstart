import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier/flat';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.data/**', '**/coverage/**', '.husky/_/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
  { files: ['**/*.{js,mjs,cjs,ts,tsx}'], languageOptions: { globals: globals.node } },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  prettier,
);
