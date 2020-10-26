/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "pipeline": {
        "build": [
            "^build",
            // "^build:esnext"
        ],
        "test": [
            "^build"
        ],
        "lint": [
            "^build",
            "eslint"
        ]
    },
    "npmClient": "pnpm"
};
