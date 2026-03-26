/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { baseConfig } from "../../eslint.config.base.mts";

const config: Linter.Config[] = [
	...baseConfig,
	{
		files: ["src/test/**/*.ts"],
		rules: {
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
