/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig, { importInternalModulesAllowedForTest } from "../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					allow: ["node:http"],
				},
			],
			"depend/ban-dependencies": [
				"error",
				{
					allowed: ["lodash.isequal"],
				},
			],
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
	{
		files: ["tests/**"],
		rules: {
			// Fine for tests to import from dev dependencies
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					devDependencies: true,
				},
			],

			// Since the "tests" directory is adjacent to "src", and this package (intentionally) does not expose
			// a single exports roll-up, reaching into "src" is required.
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [...importInternalModulesAllowedForTest, "**/src/*/*.js"],
				},
			],

			// Fine for tests to use node.js modules.
			// Tests will ensure our webpack configuration is correctly set up to support any that we use.
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
