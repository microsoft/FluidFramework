/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "plugins": [
        "@typescript-eslint",
    ],
    "extends": [
        "oclif",
        "oclif-typescript",
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        // require.resolve("@fluidframework/eslint-config-fluid"),
        "prettier",
    ],
    "rules": {
    },
}
