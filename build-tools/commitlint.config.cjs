/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'body-case': [2, 'always', 'sentence-case'],
        'subject-case': [2, 'always', 'sentence-case'],
    },
};
