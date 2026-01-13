/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { recommendedConfig } from "../../eslint.config.base.mts";

export default [
	...recommendedConfig,
	{
		rules: {
			// TODO: fix violations and remove these overrides
			"@rushstack/no-new-null": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"unicorn/no-null": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
];
