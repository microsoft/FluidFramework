const tsconfig = require("./tsconfig.json");
module.exports = {
  extends: ["plugin:@fluidx/eslint-plugin-ffx-rules/base"],
  ignorePatterns: tsconfig.exclude
};
