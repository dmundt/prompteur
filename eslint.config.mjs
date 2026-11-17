import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.vscode-test/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['src/core/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['vscode'],
          patterns: [
            '../**/platform',
            '../**/platform/**',
            '../**/workbench',
            '../**/workbench/**',
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['vscode'],
          patterns: [
            '../**/application',
            '../**/application/**',
            '../**/platform',
            '../**/platform/**',
            '../**/workbench',
            '../**/workbench/**',
          ],
        },
      ],
    },
  },
  { files: ['**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
