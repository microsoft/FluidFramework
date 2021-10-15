/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/types/tsconfig.json"]
    },
    "extends": [
        "@fluidframework/eslint-config-fluid/eslint7"
    ]
}
