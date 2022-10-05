/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid")
    ],
    "rules": {
        // This library is used in the browser, so we don't want dependencies on most node libraries.
        "import/no-nodejs-modules": ["error", {"allow": ["child_process","fs","url","util"]}],
    }
}
