/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ['@fluidframework/eslint-config-fluid/minimal-deprecated', 'prettier'],
	root: true,
	rules: {
		// TODO: Recover "noUnusedLocals" behavior as part of linting.  (This rule seems to be broken in the Fluid repo.)
		// '@typescript-eslint/no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
		'@typescript-eslint/brace-style': 'off',
		'@typescript-eslint/quotes': [
			'error',
			'single',
			{
				allowTemplateLiterals: true,
				avoidEscape: true,
			},
		],

		// Rules which could be re-enabled (by dropping these overrides, as they are enabled in base config) with some minor fixes:
		'@typescript-eslint/no-shadow': 'off',
		'no-shadow': 'off',
		'@typescript-eslint/no-unsafe-return': 'off',
		'import/no-deprecated': 'off',
		'@fluid-internal/fluid/no-unchecked-record-access': 'off',
	},
	overrides: [
		{
			files: ['src/test/**'],
			rules: {
				// Chai assertions trigger the unused expression lint rule.
				'@typescript-eslint/no-unused-expressions': 'off',

				// Dev dependencies and internal modules may be used in test code
				'import/no-extraneous-dependencies': [
					'error',
					{
						devDependencies: true,
					},
				],
				'import/no-internal-modules': 'off',
			},
		},
		{
			files: ['**/test/**', 'src/index.ts'],
			rules: {
				// Test code and the main package export shouldn't be linted for unused exports
				'import/no-unused-modules': 'off',
			},
		},
	],
};
