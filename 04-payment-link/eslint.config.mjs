import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', '.data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['web/*.js'], languageOptions: { globals: Object.fromEntries(['window', 'document', 'fetch', 'btoa', 'Uint8Array', 'URL', 'Blob', 'setTimeout', 'clearTimeout', 'console'].map(key => [key, 'readonly'])) } }
);
