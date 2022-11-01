/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    ...require("@fluidframework/build-common/prettier.config.cjs"),
    useTabs: false, // build-common 1.2.0, change to true when prettier config is applied globally
    importOrder: [
        "^node:(.*)$", // Special-case `node:` imports
        "<THIRD_PARTY_MODULES>",
        "^fluid-framework$", // Special match for `fluid-framework` package
        "^@fluidframework/(.*)$", // Match all `@fluidframework/` packages
        "^@fluid-(.*?)/(.*)$", // Match other `@fluid-` scoped packages (`@fluid-experimental/`, `@fluid-tools/`, etc.)
        "^[./]" // Match package-local file imports
    ],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,
};
