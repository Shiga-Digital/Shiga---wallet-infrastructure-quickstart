export default {
  '*.{js,mjs,cjs,ts,tsx}': ['prettier --write', 'eslint --fix --max-warnings=0'],
  '*.{json,md,html,css,yml,yaml}': ['prettier --write'],
};
