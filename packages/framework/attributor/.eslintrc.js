/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid"), "prettier"
    ],
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
    overrides: [{
        // Rules only for test files
        files: ["*.spec.ts", "src/test/**"],
        rules: {
            "import/no-nodejs-modules": [
                "error",
                { allow: ["assert"] },
            ],
        },
    }],

}
