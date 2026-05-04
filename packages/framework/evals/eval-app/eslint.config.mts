/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			// Allow explicit any for eval data processing code
			"@typescript-eslint/no-explicit-any": "off",
			// This package legitimately uses Node.js built-ins (fs, path) for file I/O
			"import-x/no-nodejs-modules": "off",
			// This package uses subdirectory imports which are intentional
			"import-x/no-internal-modules": "off",
			// Data processing code uses JSON.parse which produces any types
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			// Server app uses non-null assertions in DOM access patterns
			"@typescript-eslint/no-non-null-assertion": "off",
			// Server uses fire-and-forget patterns for background tasks
			"@typescript-eslint/no-floating-promises": "off",
			// Data readers use complex boolean checks on mixed types from JSON.parse
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "off",
			"@typescript-eslint/explicit-function-return-type": "off",
		},
	},
];

export default config;
