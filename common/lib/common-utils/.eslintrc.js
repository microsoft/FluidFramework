/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid")
    ],
    "parserOptions": {
        "project": [ "./tsconfig.json", "./src/test/mocha/tsconfig.json", "./src/test/jest/tsconfig.json", "./src/test/types/tsconfig.json" ]
    },
    "rules": {
    },
    "overrides": [
        {
            // Rules only for type validation files
            files: ['**/test/types/*.generated.*'],
            rules: {
                'max-len': 'off',
                '@typescript-eslint/semi': 'off',
                '@typescript-eslint/comma-spacing': 'off',
            },
        },
    ]
}
