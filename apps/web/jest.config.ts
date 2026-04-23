import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        module: 'commonjs',
        esModuleInterop: true,
        moduleResolution: 'node',
        paths: {
          '@/*': ['./src/*'],
        },
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testRegex: '.*\\.spec\\.tsx?$',
  // Playwright specs also end in `.spec.ts` — exclude the e2e folder so
  // Jest doesn't try to execute them as unit tests (it crashes when
  // `test.describe` resolves to Playwright's runner mid-Jest-run).
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
};

export default config;
