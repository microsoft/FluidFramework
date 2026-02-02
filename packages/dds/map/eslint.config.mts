/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strictBiome } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strictBiome,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"unicorn/numeric-separators-style": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
