/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    overrides: [
        {
            // Rules only for type validation files
            files: ["**/types/*validate*Previous*.ts"],
            rules: {
                "@typescript-eslint/comma-spacing": "off",
            },
        },
        {
            // Rules only for type validation files
            "files": ["**/test/types/*.generated.*"],
            "rules": {
                "max-len": "off",
                "@typescript-eslint/semi": "off",
                "@typescript-eslint/comma-spacing": "off",
            },
        },
    ],
}
