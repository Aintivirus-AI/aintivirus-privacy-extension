module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@wallet/(.*)$': '<rootDir>/src/wallet/$1',
    '^@security/(.*)$': '<rootDir>/src/security/$1',
    '^@privacy/(.*)$': '<rootDir>/src/privacy/$1',
    '^@decoding/(.*)$': '<rootDir>/src/decoding/$1',
    '^@solana/web3\\.js$': '<rootDir>/src/__mocks__/@solana/web3.js.ts',
    '^ethers$': '<rootDir>/src/__mocks__/ethers.ts',
    '^bip39$': '<rootDir>/src/__mocks__/bip39.ts',
    '^ed25519-hd-key$': '<rootDir>/src/__mocks__/ed25519-hd-key.ts',
    '^bs58$': '<rootDir>/src/__mocks__/bs58.ts',
    '\\.css$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/index.{ts,tsx}'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  // Increase timeout for slower tests
  testTimeout: 10000,
  // HTML reporter for test results
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle: 'AINTIVIRUS Test Report',
        outputPath: 'test-report.html',
        includeFailureMsg: true,
        includeConsoleLog: true,
        includeSuiteFailure: true,
        includeObsoleteSnapshots: true,
        // Show only failures by filtering out passed/pending tests
        statusIgnoreFilter: 'passed,pending,disabled',
        theme: 'darkTheme',
        dateFormat: 'yyyy-mm-dd HH:MM:ss',
      },
    ],
  ],
};
