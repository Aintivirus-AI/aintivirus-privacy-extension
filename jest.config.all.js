// Jest configuration for generating report with ALL test results (passed + failed)
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle: 'AINTIVIRUS Test Report - All Results',
        outputPath: 'test-report-all.html',
        includeFailureMsg: true,
        includeConsoleLog: true,
        includeSuiteFailure: true,
        includeObsoleteSnapshots: true,
        // Don't filter any statuses - show everything
        theme: 'darkTheme',
        dateFormat: 'yyyy-mm-dd HH:MM:ss',
      },
    ],
  ],
};


