/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');

module.exports = {
    mode: "development",    
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: 'index.js',
        library: 'controller',
        libraryTarget: 'var'
    },
}
