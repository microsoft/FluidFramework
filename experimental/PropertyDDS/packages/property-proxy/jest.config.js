/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        "^.+\\.(j|t)sx?$": "ts-jest",
    },
    testPathIgnorePatterns: ['/node_modules/']
};
