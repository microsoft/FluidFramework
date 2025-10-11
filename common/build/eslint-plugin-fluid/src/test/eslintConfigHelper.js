/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper to create ESLint configuration that works with both ESLint 8 and 9.
 * ESLint 8 uses the legacy config format, while ESLint 9 uses flat config.
 */

const eslintVersion = parseInt(require("eslint/package.json").version.split(".")[0]);

/**
 * Creates ESLint options object compatible with both ESLint 8 and 9.
 *
 * @param {object} config - Configuration object
 * @param {string} config.parser - Parser name (e.g., "@typescript-eslint/parser")
 * @param {object} config.parserOptions - Parser options
 * @param {object} config.plugin - Plugin object to register
 * @param {string} config.pluginName - Plugin name (e.g., "@fluid-internal/fluid")
 * @param {object} config.rules - ESLint rules configuration
 * @param {object} [config.extraPlugins] - Additional plugins to register (ESLint 9 format)
 * @returns {object} ESLint options object
 */
function createESLintConfig(config) {
	const { parser, parserOptions, plugin, pluginName, rules, extraPlugins } = config;

	const eslintOptions = {
		overrideConfigFile: eslintVersion >= 9 ? true : null,
	};

	if (eslintVersion >= 9) {
		// ESLint 9+ uses flat config
		eslintOptions.overrideConfig = [
			{
				files: ["**/*.ts"],
				languageOptions: {
					parser: require(parser),
					parserOptions,
				},
				plugins: {
					[pluginName]: plugin,
					...extraPlugins,
				},
				rules,
			},
		];
	} else {
		// ESLint 8 uses legacy config
		eslintOptions.baseConfig = {
			parser,
			parserOptions,
			plugins: [pluginName],
			rules,
		};
		eslintOptions.useEslintrc = false;
		eslintOptions.plugins = {
			[pluginName]: plugin,
			...extraPlugins,
		};
	}

	return eslintOptions;
}

module.exports = { createESLintConfig, eslintVersion };
