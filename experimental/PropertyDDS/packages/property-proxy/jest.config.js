module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        "^.+\\.(j|t)sx?$": "ts-jest",
    },
    testPathIgnorePatterns: ['/node_modules/']
};
