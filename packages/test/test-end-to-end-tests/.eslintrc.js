/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid")
    ],
    "parserOptions": {
        "project": ["./src/test/tsconfig.json"]
    },
    "rules": {
    },
    "overrides": [
        {
            // Rules only for test files
            "files": ["*.spec.ts", "src/test/**"],
            "rules": {
                "prefer-arrow-callback": "off",
            }
        },
    ],
}
