const customWebpack = require('../webpack.prod.js');
const webpackRules = customWebpack({ production: true })[1].module.rules;

module.exports = {
    "stories": [
        "../src/**/*.stories.mdx",
        "../src/**/*.stories.@(js|jsx|ts|tsx)"
    ],
    "addons": [
        "@storybook/addon-links",
        "@storybook/addon-essentials"
    ],
    webpackFinal: (config) => {
        return { ...config, module: { ...config.module, rules: webpackRules } };
    }
}
