/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [
        require.resolve("@fluidframework/eslint-config-fluid/strict"),
        "prettier",
    ],
    rules: {
        // TODO: Enable and add missing docs
        "jsdoc/require-jsdoc": "off",
    },
};
