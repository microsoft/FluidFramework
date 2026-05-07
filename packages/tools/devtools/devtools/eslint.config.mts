/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";
import type { Linter } from "eslint";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"unicorn/no-nested-ternary": "off",
			"@typescript-eslint/no-namespace": "off",
		},
	},
	{
		files: ["*.spec.ts", "*.test.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
