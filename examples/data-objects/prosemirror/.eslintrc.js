/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "ignorePatterns": ["src/prosemirror.ts", "src/index.ts", "src/fluidCollabManager.ts", "src/prosemirrorView.tsx", "src/storage/storageUtil.ts", "src/storage/storageAccount.ts", "src/utils/*"],
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    "rules": {
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/restrict-plus-operands": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-case-declarations": "off",
        "no-null/no-null": "off"
    }
}