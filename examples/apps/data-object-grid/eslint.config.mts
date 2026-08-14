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
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "off",
			"@typescript-eslint/unbound-method": "off",
			"import-x/no-unassigned-import": "off",

			// TODO: AB#75619: Exclude React code from this rule in the base eslint config.
			// In React components it is convention to use null to represent the absence of render output.
			"unicorn/no-null": "off",
		},
	},
];

export default config;
