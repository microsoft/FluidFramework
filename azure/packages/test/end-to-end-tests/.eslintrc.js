/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid"),
        "prettier",
    ],
    "rules": {
        "prefer-arrow-callback": "off",
        "@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
    },
    "parserOptions": {
        "project": [ "./src/test/tsconfig.json" ]
    }
}

