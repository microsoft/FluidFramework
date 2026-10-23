/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
import { importInternalModulesAllowed } from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [
						...importInternalModulesAllowed,
						// These emitted-package probes intentionally measure internal entrypoints.
						"@fluidframework/*/internal{,/**}",
					],
				},
			],
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
];

export default config;
