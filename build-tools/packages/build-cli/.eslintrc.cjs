/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    plugins: ["@typescript-eslint"],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        // eslint-disable-next-line node/no-extraneous-require
        require.resolve("@fluidframework/eslint-config-fluid"),
        "oclif",
        "oclif-typescript",
        "prettier",
    ],
    rules: {
        "@typescript-eslint/no-unused-vars": "warn",

        // oclif uses default exports for commands
        "import/no-default-export": "off",
        "max-params": ["error", 5],
        "unicorn/prefer-node-protocol": "off",
        "valid-jsdoc": "off",
    },
};
