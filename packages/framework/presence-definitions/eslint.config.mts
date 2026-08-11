/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			// The clarity of explicit index signatures is helpful in many places with this package.
			"@typescript-eslint/consistent-indexed-object-style": "off",
		},
	},
	{
		files: ["**/*.ts"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [
						// Within Fluid Framework allow import of '/internal' from other FF packages.
						// Note that `/internal/test**` is still restricted (disallowed) but uses
						// customCondition of "allow-ff-test-exports" for enforcement.
						"@fluidframework/*/internal{,/**}",

						// Internal packages may structure their exports arbitrarily, so allow any imports from them.
						"@fluid-internal/**",
					],
				},
			],
		},
	},
];

export default config;
