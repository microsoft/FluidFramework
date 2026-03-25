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
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["fs"],
				},
			],
			"jsdoc/require-description": "off",
			"unicorn/no-null": "off",
			"unicorn/prefer-date-now": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
];

export default config;
