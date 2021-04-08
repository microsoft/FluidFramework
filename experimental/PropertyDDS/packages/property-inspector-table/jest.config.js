// jest.config.js
module.exports = {
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/test/tsconfig.test.json'
    }
  },
  preset: "ts-jest",

  // The glob patterns Jest uses to detect test files
  testMatch: ["/**/test/*.spec.tsx"],

   testEnvironment: "jsdom",

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/node_modules/', 'dist'],

  // A map from regular expressions to paths to transformers
  transform: {
    "^.+\\.(t|j)sx?$": "ts-jest",
    '^.+\\.(jpg|jpeg|png|gif|svg|mp4)$': 'jest-transform-file'
  },

  // A map from regular expressions to module names that allow to stub out resources with a single module
  moduleNameMapper: {
    '\\.(css|less)$': 'identity-obj-proxy',
    // '\\.svg$': '<rootDir>/__mocks__/svgrMock.js'
  },

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts']
};
