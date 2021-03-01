/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "pipeline": {
        "build": [
            "^tsc",
            "^build:esnext"
        ],
        "test": [
            "^build"
        ],
        "lint": [
            "^build",
            "eslint"
        ],
        "@fluidframework/server-local-server#build": [
            "@fluidframework/server-lambdas#build",
            "@fluidframework/server-memory-orderer#build",
            "@fluidframework/server-test-utils#build",
        ],
    },
    "npmClient": "pnpm"
};
