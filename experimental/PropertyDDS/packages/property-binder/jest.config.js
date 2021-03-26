// jest.config.js
module.exports = {
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/test/tsconfig.test.json'
    }
  },
  preset: "ts-jest",

  // The glob patterns Jest uses to detect test files
  testMatch: [
    "/**/test/data_binder/*.spec.js"
  ],

  testEnvironment: "jsdom",

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/node_modules/', 'dist'],

  // A map from regular expressions to paths to transformers
  transform: {
    "^.+\\.(t|j)sx?$": "ts-jest",
  },

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  //   setupFilesAfterEnv: ['<rootDir>/test/setup.ts']
};
