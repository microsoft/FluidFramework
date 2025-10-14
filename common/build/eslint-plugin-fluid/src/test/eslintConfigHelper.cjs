/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper to create ESLint configuration that works with both ESLint 8 and 9.
 * ESLint 8 uses the legacy config format, while ESLint 9 uses flat config.
 */

// Support testing against different ESLint versions using npm aliases
const eslintPackage = process.env.ESLINT_PACKAGE || "eslint";
const eslintVersion = parseInt(require(`${eslintPackage}/package.json`).version.split(".")[0]);
const { ESLint } = require(eslintPackage);
const plugin = require("../../index.js");

/**
 * Creates ESLint options object compatible with both ESLint 8 and 9.
 *
 * @param {object} config - Configuration object
 * @param {object} config.parserOptions - Parser options
 * @param {object} config.rules - ESLint rules configuration
 * @param {object} [config.extraPlugins] - Additional plugins to register (ESLint 9 format)
 * @returns {object} ESLint options object
 */
function createESLintConfig(config) {
	const { parserOptions, rules, extraPlugins } = config;

	const parser = "@typescript-eslint/parser";
	const pluginName = "@fluid-internal/fluid";

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

module.exports = { createESLintConfig, eslintVersion, ESLint };
