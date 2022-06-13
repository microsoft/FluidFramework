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
        // Requires strictNullChecks=true in tsconfig. https://github.com/microsoft/FluidFramework/issues/9500
        "@typescript-eslint/strict-boolean-expressions": "off",
    }
}
