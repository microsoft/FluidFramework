/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { baseConfig } from "../../eslint.config.base.mts";

const config: Linter.Config[] = [
	...baseConfig,
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;
