/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper to create ESLint configuration that works with both ESLint 8 and 9.
 * ESLint 8 uses the legacy config format, while ESLint 9 uses flat config.
 */

const path = require("node:path");

// Support testing against different ESLint versions using npm aliases
const eslintPackage = process.env.ESLINT_PACKAGE || "eslint";
const eslintVersion = parseInt(require(`${eslintPackage}/package.json`).version.split(".")[0]);
const { ESLint } = require(eslintPackage);
const plugin = require("../../index.js");

/**
 * Creates ESLint options object compatible with both ESLint 8 and 9.
 *
 * @param {object} config - Configuration object
 * @param {object} config.rules - ESLint rules configuration
 * @param {object} [config.parserOptions] - Parser options (will merge with defaults)
 * @param {object} [config.extraPlugins] - Additional plugins to register (ESLint 9 format)
 * @returns {object} ESLint options object
 */
function createESLintConfig(config) {
	const { rules, extraPlugins, parserOptions: customParserOptions } = config;

	const parser = "@typescript-eslint/parser";
	const parserOptions = customParserOptions || {
		project: path.join(__dirname, "test-cases/tsconfig.json"),
	};
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

/**
 * Creates an ESLint instance with the given configuration.
 *
 * @param {object} rulesOrConfig - Either rules object or full config object with rules/parserOptions/plugins
 * @param {object} [rulesOrConfig.rules] - ESLint rules configuration
 * @param {object} [rulesOrConfig.parserOptions] - Parser options
 * @param {object} [rulesOrConfig.plugins] - Additional plugins
 * @returns {ESLint} Configured ESLint instance
 */
function createESLintInstance(rulesOrConfig) {
	const config =
		typeof rulesOrConfig === "object" && rulesOrConfig.rules
			? rulesOrConfig
			: { rules: rulesOrConfig };

	const eslintOptions = createESLintConfig({
		rules: config.rules,
		parserOptions: config.parserOptions,
		extraPlugins: config.plugins,
	});

	return new ESLint(eslintOptions);
}

module.exports = { createESLintConfig, createESLintInstance, eslintVersion, ESLint };
