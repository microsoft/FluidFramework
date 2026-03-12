/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-nodejs-modules": "off",
			"no-case-declarations": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
];

export default config;
