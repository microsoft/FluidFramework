/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    "rules": {
        // Demoted to warning as a workaround to layer-check challenges. Tracked by:
        // https://github.com/microsoft/FluidFramework/issues/10226
        "import/no-extraneous-dependencies": "warn",
    }
}
