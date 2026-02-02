/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strictBiome } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strictBiome,
	{
		rules: {
			"@typescript-eslint/consistent-indexed-object-style": "off",
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["assert"],
				},
			],
		},
	},
];

export default config;
