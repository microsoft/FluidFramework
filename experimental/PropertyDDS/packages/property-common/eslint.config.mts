/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";

import { minimalDeprecated } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"prefer-arrow-callback": "off",
			"tsdoc/syntax": "off",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["lodash"],
				},
			],
		},
	},
];

export default config;
