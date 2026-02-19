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
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"no-case-declarations": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/unbound-method": "off",
		},
	},
];

export default config;
