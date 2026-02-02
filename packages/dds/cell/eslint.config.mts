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
			"unicorn/numeric-separators-style": "off",
		},
	},
];

export default config;
