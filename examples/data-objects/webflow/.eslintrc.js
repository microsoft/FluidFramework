/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    "rules": {
        // Requires strictNullChecks=true in tsconfig. https://github.com/microsoft/FluidFramework/issues/9500
        "@typescript-eslint/strict-boolean-expressions": "off",
        "import/no-internal-modules": "off",
        "max-len": "off",
        "no-bitwise": "off",
        "no-case-declarations": "off",
    },
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
}
