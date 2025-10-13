/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid")],
    rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-inner-declarations": "off",
    },
    overrides: [
        {
            // Rules only for type validation files
            files: ["**/test/types/*.generated.*"],
            rules: {
                "max-len": "off",
                "@typescript-eslint/semi": "off",
                "@typescript-eslint/comma-spacing": "off",
            },
        },
    ],
};
