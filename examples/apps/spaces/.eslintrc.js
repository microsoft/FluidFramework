/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is a workaround for https://github.com/eslint/eslint/issues/3458
require("@fluidframework/eslint-config-fluid/patch/modern-module-resolution");

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    "rules": {
        "@typescript-eslint/strict-boolean-expressions": "off", // Doing undefined checks is nice
        "@typescript-eslint/unbound-method": "off", // Used to do binding for react methods
        "import/no-internal-modules": "off", // required for dynamically importing css files for react-grid-layout
        "import/no-unassigned-import": "off" // required for dynamically importing css files for react-grid-layout
    }
}
