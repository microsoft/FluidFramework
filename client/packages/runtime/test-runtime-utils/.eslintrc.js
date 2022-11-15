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
        "@typescript-eslint/strict-boolean-expressions": "off",

        // This library is used in the browser, so we don't want dependencies on most node libraries.
        "import/no-nodejs-modules": ["error", {"allow": ["events"]}],
    },
    "overrides": [
        {
            // The assertion shortcode map file is auto-generated, so disable some rules.
            "files": ["src/assertionShortCodesMap.ts"],
            "rules": {
                "@typescript-eslint/comma-dangle": "off",
            }
        }
    ],

}
