/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommendedConfig } from "../../eslint.config.base.mts";

const config: Linter.Config[] = [
	...recommendedConfig,
	{
		rules: {
			// Additional lambdas-specific rules
			"@rushstack/no-new-null": "off",
			"unicorn/no-null": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
	{
		ignores: ["*.generated.ts", "*.spec.ts"],
	},
];

export default config;
