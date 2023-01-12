/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"
    ],
    "rules": {
        "@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
        "import/no-nodejs-modules": "off",
    },
    "parserOptions": {
        "project": [ "./src/test/tsconfig.json" ]
    }
}
