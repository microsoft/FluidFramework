/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		files: ["src/test/**/*.spec.ts"],
		rules: {
			// Allow named functions in mocha hooks (before, beforeEach, etc.) so that
			// the function name appears in error output and stack traces.
			"prefer-arrow-callback": ["error", { allowNamedFunctions: true }],
		},
	},
];

export default config;
