/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from 'eslint';
import { recommended } from '../../../common/build/eslint-config-fluid/flat.mts';

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			'@fluid-internal/fluid/no-unchecked-record-access': 'off',
			'@typescript-eslint/consistent-type-exports': 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-shadow': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/strict-boolean-expressions': 'off',
			'import-x/no-deprecated': 'off',
			'jsdoc/require-description': 'off',
			'no-shadow': 'off',
			'require-atomic-updates': 'off',
			'@typescript-eslint/consistent-type-imports': 'off',
			'unicorn/escape-case': 'off',
			'unicorn/explicit-length-check': 'off',
			'unicorn/new-for-builtins': 'off',
			'unicorn/no-array-for-each': 'off',
			'unicorn/no-array-reduce': 'off',
			'unicorn/no-await-expression-member': 'off',
			'unicorn/no-empty-file': 'off',
			'unicorn/no-instanceof-array': 'off',
			'unicorn/no-lonely-if': 'off',
			'unicorn/no-negated-condition': 'off',
			'unicorn/no-new-array': 'off',
			'unicorn/no-null': 'off',
			'unicorn/no-object-as-default-parameter': 'off',
			'unicorn/no-useless-promise-resolve-reject': 'off',
			'unicorn/numeric-separators-style': 'off',
			'unicorn/prefer-code-point': 'off',
			'unicorn/prefer-negative-index': 'off',
			'unicorn/prefer-node-protocol': 'off',
			'unicorn/prefer-number-properties': 'off',
			'unicorn/prefer-prototype-methods': 'off',
			'unicorn/prefer-spread': 'off',
			'unicorn/prefer-string-slice': 'off',
			'unicorn/switch-case-braces': 'off',
			'unicorn/text-encoding-identifier-case': 'off',
			'unicorn/throw-new-error': 'off',
		},
	},
	{
		files: ['src/test/**'],
		rules: {
			'@typescript-eslint/no-unused-expressions': 'off',
			'import-x/no-extraneous-dependencies': [
				'error',
				{
					'devDependencies': true,
				},
			],
			'import-x/no-internal-modules': 'off',
		},
	},
	{
		files: ['**/test/**', 'src/index.ts'],
		rules: {
			'import-x/no-unused-modules': 'off',
		},
	},
];

export default config;
