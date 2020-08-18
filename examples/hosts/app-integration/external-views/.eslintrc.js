/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    "parserOptions": {
        "project": [
            "./tsconfig.json",
            "./src/tsconfig.json",
            "./test/tsconfig.json",
        ]
    },
    "rules": {}
}
