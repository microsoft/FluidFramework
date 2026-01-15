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
			"import-x/no-extraneous-dependencies": "off",
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			// TODO: AB#18875 - Re-enable react/no-deprecated once we replace uses of the deprecated ReactDOM.render()
			// with the new React 18 createRoot().
			"react/no-deprecated": "off",
			// TODO: These rules should be re-enabled once we are on eslint 9
			// and the react plugins are upgraded to more recent versions
			"react-hooks/immutability": "warn",
			"react-hooks/refs": "warn",
			"react-hooks/rules-of-hooks": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/static-components": "warn",
		},
	},
	// Overrides for test files
	{
		files: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
