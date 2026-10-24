/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		files: ["playwright.config.ts"],
		// Playwright loads its configuration in Node.js through a default export.
		rules: {
			"import-x/no-nodejs-modules": "off",
			"import-x/no-default-export": "off",
		},
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: "./tests/tsconfig.json",
			},
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react-hooks/exhaustive-deps": ["error"],
			"react-hooks/rules-of-hooks": "error",
			"@eslint-react/jsx-no-key-after-spread": "error",
		},
	},
];

export default config;
