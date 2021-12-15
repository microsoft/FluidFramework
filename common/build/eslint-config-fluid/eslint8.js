/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "./eslint7.js"
    ],
    "rules": {
        // This rule has false positives in many of our test projects.
        "@typescript-eslint/unbound-method": "off",
    },
};
