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
			// TODO: consider re-enabling once we have addressed how this rule conflicts with our error codes.
			"unicorn/numeric-separators-style": "off",
		},
	},
];

export default config;
