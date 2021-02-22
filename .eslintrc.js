/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ['@fluidframework/eslint-config-fluid/eslint7'],
	root: true,
	rules: {
		// TODO: Recover "noUnusedLocals" behavior as part of linting.  (This rule seems to be broken in the Fluid repo.)
		// '@typescript-eslint/no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
		'@typescript-eslint/quotes': [
			'error',
			'single',
			{
				allowTemplateLiterals: true,
				avoidEscape: true,
			},
		],
		// Intentionally not unifying signatures can enable more scoped API documentation and a better developer experience, which accounts
		// for all violations of this rule in this package at the time of writing.
		'@typescript-eslint/unified-signatures': 'off',

		// Prettier
		'comma-dangle': 'off',
		'@typescript-eslint/comma-dangle': 'off',
		'max-len': 'off',

		// Rules which could be re-enabled (by dropping these overrides, as they are enabled in base config) with some minor fixes:
		'@typescript-eslint/no-shadow': 'off',
		'no-shadow': 'off',
		'prefer-arrow/prefer-arrow-functions': 'off',
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
