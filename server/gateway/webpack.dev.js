/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");

module.exports = {
    mode: "development",
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: "[name].js",
        library: "[name]",
        // https://github.com/webpack/webpack/issues/5767
        // https://github.com/webpack/webpack/issues/7939
        devtoolNamespace: "routerlicious"
    },
}
