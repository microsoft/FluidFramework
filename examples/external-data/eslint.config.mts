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
					"allow": [
						...importInternalModulesAllowedForTest,
						"**/src/*/*.js",
						// `react-dom/client` is a subpath export, so the rule treats it as an internal module even though it is
						// React's public React 18 entry point.
						"react-dom/client",
					],
				},
			],
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
