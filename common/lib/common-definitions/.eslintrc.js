/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended"), "prettier"],
    "rules": {},
    "overrides": [{
        // Rules only for type validation files
        files: ["**/types/*validate*Previous*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
        },
    },],
};
