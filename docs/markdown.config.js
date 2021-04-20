/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");

/* markdown-magic config */
module.exports = {
    transforms: {
        /* Match <!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=../file.js) --> */
        INCLUDE(content, options) {
            const fileContents = fs.readFileSync(options.path, "utf8");
            return fileContents;
        },
        SCRIPTS: require("markdown-magic-package-scripts"),
    },
    callback: function () {
        console.log("done");
    }
}
