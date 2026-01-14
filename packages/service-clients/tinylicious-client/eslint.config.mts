/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		files: ["src/test/*.spec.ts"],
		rules: {
			// Mocha tests should prefer regular functions, see https://mochajs.org/#arrow-functions
			"prefer-arrow-callback": "off",
		},
	},
];

export default config;
