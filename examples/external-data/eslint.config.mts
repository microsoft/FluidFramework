/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
import sharedConfig, { importInternalModulesAllowedForTest } from "../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		// Override @typescript-eslint/parser to use an explicit project list instead of
		// projectService. The default service only discovers tsconfig.json, but the
		// `eslint` script here lints both src and tests, and tests live under their own
		// noEmit project (tsconfig.test.json) so they don't pollute the package's emit.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.json", "./tsconfig.test.json"],
			},
		},
	},
	{
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:http"],
				},
			],
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["lodash.isequal"],
				},
			],
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react/no-deprecated": "off",
			"react-hooks/immutability": "warn",
			"react-hooks/refs": "warn",
			"react-hooks/rules-of-hooks": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/static-components": "warn",
		},
	},
	{
		files: ["tests/**"],
		rules: {
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": true,
				},
			],
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [...importInternalModulesAllowedForTest, "**/src/*/*.js"],
				},
			],
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
