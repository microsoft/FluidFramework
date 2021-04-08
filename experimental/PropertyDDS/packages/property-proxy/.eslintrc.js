

const eslintConfig = require("@fluidframework/eslint-config-fluid");

const noTypeScript = x => !x.includes("typescript");

const jsOnlyRules = {};
Object.keys(eslintConfig.rules).filter(noTypeScript).forEach(x => jsOnlyRules[x] = eslintConfig.rules[x]);
eslintConfig.rules = jsOnlyRules;

eslintConfig.extends = eslintConfig.extends.filter(noTypeScript);
eslintConfig.plugins = eslintConfig.plugins.filter(noTypeScript);

module.exports = eslintConfig;
