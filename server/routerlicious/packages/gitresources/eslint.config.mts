/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommendedConfig } from "../../eslint.config.base.mts";

const config: Linter.Config[] = [
	...recommendedConfig,
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;
