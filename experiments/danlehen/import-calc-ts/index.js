// Bootstrap ES6 modules in node via 'esm'.
require = require("esm")(module)
module.exports = require("./test.js")
