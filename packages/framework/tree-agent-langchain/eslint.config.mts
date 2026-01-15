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
			// Allow reaching into FluidFramework package paths that end with alpha, beta, legacy, or internal
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/alpha",
						"@fluidframework/*/beta",
						"@fluidframework/*/legacy",
						"@fluidframework/*/internal",
					],
				},
			],
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
			// Test files can import from submodules for testing purposes
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"*/index.js",
						"@fluidframework/*/alpha",
						"@fluidframework/*/beta",
						"@fluidframework/*/legacy",
						"@fluidframework/*/internal",
					],
				},
			],
			// Allow unresolved for intentionally reaching into alpha/internal of other packages during integration tests
			"import-x/no-unresolved": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
];

export default config;
