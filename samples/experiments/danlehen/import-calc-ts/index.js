/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Bootstrap ES6 modules in node via 'esm'.
require = require("esm")(module)
module.exports = require("./test.js")
