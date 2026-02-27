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
import { plugin } from "../../lib/index.js";
import type {
	CompatESLintOptions,
	CompatRulesRecord,
	CompatParserOptions,
	CompatPlugin,
} from "../../lib/eslint-compat-types.js";

// Support testing against different ESLint versions using npm aliases
const eslintPackage = process.env.ESLINT_PACKAGE || "eslint";
const eslintVersion = parseInt(require(`${eslintPackage}/package.json`).version.split(".")[0]);
const { ESLint: ESLintClass } = require(eslintPackage) as { ESLint: typeof ESLint };

interface ConfigInput {
	rules: Partial<CompatRulesRecord>;
	parserOptions?: CompatParserOptions;
	extraPlugins?: Record<string, CompatPlugin>;
}

/**
 * Creates ESLint options object compatible with both ESLint 8 and 9.
 *
 * @param config - Configuration object
 * @returns ESLint options object
 */
function createESLintConfig(config: ConfigInput): CompatESLintOptions {
	const { rules, extraPlugins, parserOptions: customParserOptions } = config;

	const parser = "@typescript-eslint/parser";
	// Test cases are at the root level, adjacent to src/
	const testCasesDir = __dirname.includes("lib")
		? path.join(__dirname, "../../test-cases")
		: path.join(__dirname, "../test-cases");
	const parserOptions = customParserOptions || {
		project: path.join(testCasesDir, "tsconfig.json"),
	};
	const pluginName = "@fluid-internal/fluid";

	const eslintOptions: CompatESLintOptions = {
		overrideConfigFile: eslintVersion >= 9 ? true : undefined,
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
				// Cast needed: CompatRulesRecord is a flexible type compatible with both versions
				rules: rules as any,
			},
		];
	} else {
		// ESLint 8 uses legacy config
		eslintOptions.baseConfig = {
			parser,
			parserOptions,
			plugins: [pluginName],
			// Cast needed: CompatRulesRecord is a flexible type compatible with both versions
			rules: rules as any,
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
	rules?: Partial<CompatRulesRecord>;
	parserOptions?: CompatParserOptions;
	plugins?: Record<string, CompatPlugin>;
}

/**
 * Creates an ESLint instance with the given configuration.
 *
 * @param rulesOrConfig - Either rules object or full config object with rules/parserOptions/plugins
 * @returns Configured ESLint instance
 */
function createESLintInstance(
	rulesOrConfig: Partial<CompatRulesRecord> | ESLintInstanceConfig,
): ESLint {
	// Check if this is a full config object (has rules, parserOptions, or plugins properties)
	// or just a rules object
	let config: ESLintInstanceConfig;
	if (
		typeof rulesOrConfig === "object" &&
		("rules" in rulesOrConfig || "parserOptions" in rulesOrConfig || "plugins" in rulesOrConfig)
	) {
		config = rulesOrConfig as ESLintInstanceConfig;
	} else {
		config = { rules: rulesOrConfig as Partial<CompatRulesRecord> };
	}

	const eslintOptions = createESLintConfig({
		rules: config.rules ?? {},
		parserOptions: config.parserOptions,
		extraPlugins: config.plugins,
	});

	// Cast to any because CompatESLintOptions is a union type that works for both ESLint 8 and 9
	return new ESLintClass(eslintOptions as any);
}

/**
 * Gets the test cases directory path.
 * Test cases are at the root level, adjacent to src/.
 */
function getTestCasesDir(): string {
	return __dirname.includes("lib")
		? path.join(__dirname, "../../test-cases")
		: path.join(__dirname, "../test-cases");
}

export {
	createESLintConfig,
	createESLintInstance,
	eslintVersion,
	ESLintClass as ESLint,
	getTestCasesDir,
};
