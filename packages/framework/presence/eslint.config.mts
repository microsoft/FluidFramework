/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			// The clarity of explicit index signatures is helpful in many places with this package.
			"@typescript-eslint/consistent-indexed-object-style": "off",
			// TODO: Reenable no-explicit-any once need with ValueDirectoryOrState is
			// understood. If `any` is still needed disable is on a per line basis.
			"@typescript-eslint/no-explicit-any": "off",
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/internal{,/**}",
						"*/index.js",
						"@fluidframework/presence/alpha",
						"@fluidframework/presence/beta",
					],
				},
			],
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
			// TODO: There are several violations, mostly in test code. Set to warn to enable cleanup while unblocking lint upgrades.
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			// Test files are run in node only so additional node libraries can be used.
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:assert"],
				},
			],
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.main.json", "./tsconfig.json", "./src/test/tsconfig.json"],
			},
		},
	},
];

export default config;
