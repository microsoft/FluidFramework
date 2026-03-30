/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"import-x/no-nodejs-modules": "off",
			"jsdoc/require-description": "off",
			"no-void": "off",
			"unicorn/catch-error-name": "off",
			"unicorn/explicit-length-check": "off",
			"unicorn/new-for-builtins": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-await-expression-member": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-useless-promise-resolve-reject": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-optional-catch-binding": "off",
			"unicorn/prefer-set-has": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/switch-case-braces": "off",
			"unicorn/throw-new-error": "off",
		},
	},
];

export default config;
