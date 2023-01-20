/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'body-case': [1, 'sentence-case', 'always'],
        'subject-case': [1, 'sentence-case', 'always'],
    }
};
