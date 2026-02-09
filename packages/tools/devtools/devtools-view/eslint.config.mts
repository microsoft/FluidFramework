/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"@typescript-eslint/unbound-method": "off",
			"unicorn/consistent-function-scoping": "off",
			"unicorn/no-nested-ternary": "off",
			"unicorn/no-useless-undefined": "off",
			"no-restricted-imports": ["error", "@fluentui/react"],
			"import-x/no-unassigned-import": [
				"error",
				{
					"allow": ["@testing-library/jest-dom"],
				},
			],
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react-hooks/immutability": "warn",
			"react-hooks/refs": "warn",
			"react-hooks/rules-of-hooks": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/static-components": "warn",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"unicorn/prefer-module": "off",
			"import-x/no-internal-modules": "off",
		},
	},
	{
		files: ["src/test/screenshot/**"],
		rules: {
			"import-x/no-default-export": "off",
			"import-x/no-nodejs-modules": "off",
			"import-x/no-extraneous-dependencies": "off",
		},
	},
	{
		// Override @typescript-eslint/parser to use explicit project list instead of projectService.
		// Tests use tsconfig.jest.json instead of the standard src/test/tsconfig.json naming,
		// so typescript-eslint's projectService can't auto-discover the test configuration.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.esm.json", "./src/test/tsconfig.esm.json"],
			},
		},
	},
];

export default config;
