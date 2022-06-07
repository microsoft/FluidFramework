/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

 module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid")
    ],
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
    "rules": {
        "@typescript-eslint/no-use-before-define":"off",
        "@typescript-eslint/promise-function-async":"off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "import/no-internal-modules":"off",
    }
}
