/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";
import sharedConfig, { importInternalModulesAllowed } from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...strict,
	...sharedConfig,
	{
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					// This example consumes the Claims DDS and the container/runtime plumbing
					// through their `/internal` entry points, since no public consumption path
					// for Claims exists yet.
					allow: [...importInternalModulesAllowed, "@fluidframework/*/internal"],
				},
			],
		},
	},
];

export default config;
