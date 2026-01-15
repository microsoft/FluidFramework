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
			// Disabled because they disagrees with React common patterns / best practices.
			"@typescript-eslint/unbound-method": "off",
			"unicorn/consistent-function-scoping": "off",
			// Disabled because they conflict with Prettier.
			"unicorn/no-nested-ternary": "off",
			/*
			 *
			 * TODO: remove this override once dependency on base config has been updated
			 * (newer versions will have this rule disabled).
			 */
			"unicorn/no-useless-undefined": "off",
			// Forbid new imports from legacy FluentUI react package.
			// We have a couple of components that still use it, but new usages should not be added without due consideration.
			"no-restricted-imports": ["error", "@fluentui/react"],
			// Allow unassigned imports for testing-library/jest-dom
			"import-x/no-unassigned-import": ["error", {
				"allow": ["@testing-library/jest-dom"],
			}],
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			// TODO: These rules should be re-enabled once we are on eslint 9
			// and the react plugins are upgraded to more recent versions
			"react-hooks/immutability": "warn",
			"react-hooks/refs": "warn",
			"react-hooks/rules-of-hooks": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/static-components": "warn",
		},
	},
	// Overrides for jest test files
	{
		files: ["src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"unicorn/prefer-module": "off",
			"import-x/no-internal-modules": "off",
		},
	},
	// Overrides for screenshot tests
	{
		files: ["src/test/screenshot/**"],
		rules: {
			// Default exports are used by "Storybook" modules to describe test scenarios
			"import-x/no-default-export": "off",
			// Fine for tests
			"import-x/no-nodejs-modules": "off",
			"import-x/no-extraneous-dependencies": "off",
		},
	},
	{
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
