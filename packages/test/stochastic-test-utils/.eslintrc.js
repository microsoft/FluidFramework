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
        // Intentionally not unifying signatures can enable more scoped API documentation and a better developer experience.
        // Once @typescript-eslint/eslint-plugin is updated to ^5.19.0, this could use the `ignoreDifferentlyNamedParameters`
        // option instead.
        "@typescript-eslint/unified-signatures": 'off',
    }
}
