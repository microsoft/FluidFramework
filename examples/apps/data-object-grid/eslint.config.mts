/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "off", // Doing undefined checks is nice
			"@typescript-eslint/unbound-method": "off", // Used to do binding for react methods
			"import-x/no-unassigned-import": "off", // required for dynamically importing css files for react-grid-layout
		},
	},
];

export default config;
