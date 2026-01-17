/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	// This package is test-only and only has src/tsconfig.json (no root tsconfig.json).
	// Override the base config's parserOptions to only use the test tsconfig.
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./src/tsconfig.json"],
			},
		},
	},
	{
		rules: {
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
