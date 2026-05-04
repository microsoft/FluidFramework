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
			// Allow explicit any for LLM integration and eval scaffolding code
			"@typescript-eslint/no-explicit-any": "off",
			// This package legitimately uses Node.js built-ins (fs, path) for file I/O
			"import-x/no-nodejs-modules": "off",
			// This package uses subdirectory imports (e.g., ./components/) which are intentional
			"import-x/no-internal-modules": "off",
			// Workspace deps (@fluidframework/tree-agent etc.) may not be built yet
			"import-x/no-unresolved": "off",
			// App code uses non-null assertions in React entry points
			"@typescript-eslint/no-non-null-assertion": "off",
			// LLM integration code uses dynamic types
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			// Deprecated alpha APIs are used intentionally during development
			"import-x/no-deprecated": "off",
			// Entry point modules use promise chains instead of top-level await
			"unicorn/prefer-top-level-await": "off",
			// CLI-style process.exit usage in index.ts
			"unicorn/no-process-exit": "off",
			// void operator used to discard promise return values in event handlers
			"no-void": ["error", { "allowAsStatement": true }],
			// location.hash assignment after await is intentional browser navigation
			"require-atomic-updates": "off",
			// CSS side-effect imports are intentional
			"import-x/no-unassigned-import": ["error", { "allow": ["**/*.css"] }],
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
];

export default config;
