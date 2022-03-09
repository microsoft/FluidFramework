module.exports = {
    roots: ["<rootDir>/dist"],
    testEnvironment: "jsdom",
    testMatch: ["**/?(*.)+(spec|test).[j]s"],
    testPathIgnorePatterns: ["/node_modules/"],
    verbose: true,
};
