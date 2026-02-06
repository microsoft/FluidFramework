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
			"import-x/no-deprecated": "off", // This package uses deprecated APIs by design.
			"jsdoc/require-description": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
];

export default config;
