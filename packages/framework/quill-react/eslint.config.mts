/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{ allow: ["@fluidframework/*/alpha", "@fluidframework/*/internal", "*/index.js"] },
			],
		},
	},
];

export default config;
