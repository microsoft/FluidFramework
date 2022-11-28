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
    ],
}
