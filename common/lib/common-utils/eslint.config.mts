/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		// Override @typescript-eslint/parser to use explicit project list instead of projectService.
		// This package has non-standard test directories (mocha/, jest/, types/) that
		// typescript-eslint's projectService can't auto-discover.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: [
					"./tsconfig.json",
					"./src/test/mocha/tsconfig.json",
					"./src/test/jest/tsconfig.cjs.json",
					"./src/test/types/tsconfig.json",
				],
			},
		},
	},
	{
		// This package has been deprecated in favor of @fluidframework/core-utils and
		// @fluid-internal/client-utils. Existing violations are not being fixed here.
		linterOptions: {
			reportUnusedDisableDirectives: "off",
		},
		rules: {
			"@eslint-community/eslint-comments/require-description": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/prefer-promise-reject-errors": "off",
			"depend/ban-dependencies": "off",
			"import-x/no-deprecated": "off",
			"import-x/no-nodejs-modules": "off",
			"unicorn/prefer-at": "off",
			"unicorn/prefer-code-point": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-string-replace-all": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
];

export default config;
