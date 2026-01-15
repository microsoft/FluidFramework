/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			// TODO: remove these overrides and fix violations
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"import/no-nodejs-modules": "off",
			"unicorn/no-process-exit": "off",
			"unicorn/prefer-node-protocol": "off",
		},
	},
];

export default config;
