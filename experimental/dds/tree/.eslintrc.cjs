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

		// This package is effectively deprecated. The below rules are disabled for ease of migration and will not be enabled.
		'@typescript-eslint/explicit-function-return-type': 'off',
		'@typescript-eslint/no-shadow': 'off',
		'no-shadow': 'off',
		'@typescript-eslint/no-unsafe-return': 'off',
		'import-x/no-deprecated': 'off',
		'@fluid-internal/fluid/no-unchecked-record-access': 'off',
	},
	overrides: [
		{
			files: ['src/test/**'],
			rules: {
				// Chai assertions trigger the unused expression lint rule.
				'@typescript-eslint/no-unused-expressions': 'off',

				// Dev dependencies and internal modules may be used in test code
				'import-x/no-extraneous-dependencies': [
					'error',
					{
						devDependencies: true,
					},
				],
				'import-x/no-internal-modules': 'off',
			},
		},
		{
			files: ['**/test/**', 'src/index.ts'],
			rules: {
				// Test code and the main package export shouldn't be linted for unused exports
				'import-x/no-unused-modules': 'off',
			},
		},
	],
};
