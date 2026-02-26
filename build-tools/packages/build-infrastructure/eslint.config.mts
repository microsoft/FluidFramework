/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig, chaiFriendlyConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	// Ignore test data files
	{
		ignores: ["src/test/data/**"],
	},
	// Chai-friendly rules for test files
	{
		files: ["**/*.spec.ts", "src/test/**"],
		...chaiFriendlyConfig,
	},
];
