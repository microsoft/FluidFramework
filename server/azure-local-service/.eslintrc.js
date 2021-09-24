/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

 module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid/eslint7"
    ],
    "parserOptions": {
        "project": ["./tsconfig.json"]
    },
    "rules": {
        "import/no-unassigned-import": "off",
        "@typescript-eslint/strict-boolean-expressions": "off"
    }
}
