/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper to create ESLint configuration that works with both ESLint 8 and 9.
 * ESLint 8 uses the legacy config format, while ESLint 9 uses flat config.
 */

import * as path from "node:path";
import type { ESLint } from "eslint";
import type { Rule } from "eslint";

// Support testing against different ESLint versions using npm aliases
const eslintPackage = process.env.ESLINT_PACKAGE || "eslint";
const eslintVersion = parseInt(require(`${eslintPackage}/package.json`).version.split(".")[0]);
const { ESLint: ESLintClass } = require(eslintPackage) as { ESLint: typeof ESLint };
const plugin = require("../../lib/index.js");

interface ConfigInput {
	rules: Record<string, any>;
	parserOptions?: Record<string, any>;
	extraPlugins?: Record<string, any>;
}

interface ESLintOptions {
	overrideConfigFile?: boolean | null;
	overrideConfig?: any[];
	baseConfig?: any;
	useEslintrc?: boolean;
	plugins?: Record<string, any>;
}

/**
 * Creates ESLint options object compatible with both ESLint 8 and 9.
 *
 * @param config - Configuration object
 * @returns ESLint options object
 */
function createESLintConfig(config: ConfigInput): ESLintOptions {
	const { rules, extraPlugins, parserOptions: customParserOptions } = config;

	const parser = "@typescript-eslint/parser";
	// When running from compiled code in lib/, we need to reference the src/ directory for test-cases
	const testCasesDir = __dirname.includes("lib")
		? path.join(__dirname, "../../src/test/test-cases")
		: path.join(__dirname, "test-cases");
	const parserOptions = customParserOptions || {
		project: path.join(testCasesDir, "tsconfig.json"),
	};
	const pluginName = "@fluid-internal/fluid";

	const eslintOptions: ESLintOptions = {
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

interface ESLintInstanceConfig {
	rules?: Record<string, any>;
	parserOptions?: Record<string, any>;
	plugins?: Record<string, any>;
}

/**
 * Creates an ESLint instance with the given configuration.
 *
 * @param rulesOrConfig - Either rules object or full config object with rules/parserOptions/plugins
 * @returns Configured ESLint instance
 */
function createESLintInstance(rulesOrConfig: Record<string, any> | ESLintInstanceConfig): ESLint {
	const config: ESLintInstanceConfig =
		typeof rulesOrConfig === "object" && "rules" in rulesOrConfig
			? rulesOrConfig
			: { rules: rulesOrConfig };

	const eslintOptions = createESLintConfig({
		rules: config.rules ?? {},
		parserOptions: config.parserOptions,
		extraPlugins: config.plugins,
	});

	return new ESLintClass(eslintOptions);
}

/**
 * Gets the test cases directory path.
 * When running from compiled code in lib/, this references the src/ directory.
 */
function getTestCasesDir(): string {
	return __dirname.includes("lib")
		? path.join(__dirname, "../../src/test/test-cases")
		: path.join(__dirname, "test-cases");
}

export {
	createESLintConfig,
	createESLintInstance,
	eslintVersion,
	ESLintClass as ESLint,
	getTestCasesDir,
};
