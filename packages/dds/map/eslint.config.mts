/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",

			// TODO: consider re-enabling once we have addressed how this rule conflicts with our error codes.
			"unicorn/numeric-separators-style": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			// Allow tests (which only run in Node.js) use `__dirname`
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
