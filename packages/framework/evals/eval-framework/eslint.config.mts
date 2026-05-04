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
			// Allow explicit any for eval/LLM integration code
			"@typescript-eslint/no-explicit-any": "off",
			// This package legitimately uses Node.js built-ins (fs, path) for file I/O
			"import-x/no-nodejs-modules": "off",
			// This package uses subdirectory imports (e.g., ./evaluators/) which is intentional
			"import-x/no-internal-modules": "off",
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
];

export default config;
