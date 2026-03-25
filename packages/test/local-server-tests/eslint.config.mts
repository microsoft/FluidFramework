/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";

import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": ["src/utils.ts", "src/test/**"],
				},
			],
			"unicorn/catch-error-name": "off",
			"unicorn/error-message": "off",
			"unicorn/no-array-reduce": "off",
			"unicorn/no-lonely-if": "off",
			"unicorn/no-object-as-default-parameter": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-optional-catch-binding": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
	{
		// Override @typescript-eslint/parser to use explicit project list instead of projectService.
		// This is a test-only package without a root tsconfig.json, so typescript-eslint's
		// projectService can't auto-discover the project configuration.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./src/test/tsconfig.json"],
			},
		},
	},
];

export default config;
