/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    ...require("@fluidframework/build-common/prettier.config.cjs"),
    importOrder: [
        "^node:(.*)$", // Special-case `node:` imports
        "<THIRD_PARTY_MODULES>",
        "^[./]",
    ],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,
};
