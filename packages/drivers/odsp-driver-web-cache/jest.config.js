module.exports = {
    roots: ["<rootDir>/src"],
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["**/dist/test/jest/?(*.)+(spec|test).js"],
    testPathIgnorePatterns: ["/node_modules/"],
    verbose: true,
};
