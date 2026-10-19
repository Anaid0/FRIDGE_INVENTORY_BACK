// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Regla de dependencias de la arquitectura hexagonal:
 *   infraestructure -> application -> domain
 * domain no conoce a nadie; application solo conoce domain (y sus propios puertos).
 */
const FRAMEWORKS = [
  'express',
  'express-*',
  '@prisma/*',
  'prisma',
  'bcrypt',
  'jsonwebtoken',
  'multer',
  'pino',
  'zod',
  'dotenv',
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'uploads/**',
      'infraestructure/persistence/prisma/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/application/**', '**/infraestructure/**'],
              message: 'domain no puede depender de application ni de infraestructure.',
            },
            { group: FRAMEWORKS, message: 'domain debe estar libre de frameworks y librerías externas.' },
          ],
        },
      ],
    },
  },
  {
    files: ['application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infraestructure/**'],
              message: 'application no puede depender de infraestructure; usa un puerto.',
            },
            {
              group: FRAMEWORKS,
              message: 'application no debe depender de frameworks; define un puerto en application/ports.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
