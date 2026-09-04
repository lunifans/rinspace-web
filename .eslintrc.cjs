module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks', 'import'],
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['build/', 'coverage/', 'src/plugins/'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@/components/animate-ui', '@/components/animate-ui/*'],
        message: 'Import Animate UI only through a Rinspace-owned components/ui wrapper.',
      }],
    }],
  },
  overrides: [
    {
      files: ['src/components/ui/**/*.{ts,tsx}'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      files: ['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['pages', 'pages/*', '@/pages', '@/pages/*'], message: 'App/features must not depend on route page modules.' },
            { group: ['@/components/animate-ui', '@/components/animate-ui/*'], message: 'Use components/ui wrappers.' },
          ],
        }],
        'no-restricted-globals': ['error', { name: 'fetch', message: 'Use a typed service operation instead of raw transport.' }],
      },
    },
  ],
};
