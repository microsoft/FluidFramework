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
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
	// The assertion shortcode map file is auto-generated, so disable some rules.
	{
		files: ["src/assertionShortCodesMap.ts"],
		rules: {
			"@typescript-eslint/comma-dangle": "off",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
