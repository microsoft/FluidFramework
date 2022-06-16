/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid")
    ],
    "parserOptions": {
        "project": [ "./tsconfig.json", "./src/test/tsconfig.json" ]
    },
    "rules": {
        "prefer-arrow-callback": "off",
        "tsdoc/syntax": "off",
    }
}
