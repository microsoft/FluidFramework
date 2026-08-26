/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
import sharedConfig, { importInternalModulesAllowed } from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [
						...importInternalModulesAllowed,
						// This package is a candidate shipping tool, not only example code, so it can use Fluid's internal assertion utility.
						"@fluidframework/core-utils/internal"
					],
				},
			],
		},
	},
];

export default config;
