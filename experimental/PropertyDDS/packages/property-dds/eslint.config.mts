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
			"@typescript-eslint/strict-boolean-expressions": "off",
			"tsdoc/syntax": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["axios", "lodash"],
				},
			],
		},
	},
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];

export default config;
