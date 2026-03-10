/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			// #region TODO: Fix violations and remove these rule disables

			"@fluid-internal/fluid/no-unchecked-record-access": "warn",

			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",

			"prefer-arrow-callback": "off",

			// #endregion
		},
	},
];

export default config;
