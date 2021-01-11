/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ['@fluidframework/eslint-config-fluid/eslint7'],
	// This setting is the same as in fluid. However, specifying it here causes the parser module to be evaluated relative
	// to shared-tree, which references @typescript-eslint/parser@~4.2.0 rather than @2.17.0. The former supports more advanced array
	// types which are used in several modules.
	parser: '@typescript-eslint/parser',
	root: true,
	rules: {
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
		'max-len': 'off',

		// Rules which could be re-enabled (by dropping these overrides, as they are enabled in base config) with some minor fixes:
		'@typescript-eslint/strict-boolean-expressions': 'off',
		'no-shadow': 'off',
		'prefer-arrow/prefer-arrow-functions': 'off',
		'no-null/no-null': 'off', // Payloads use null
		'no-redeclare': 'off', // Persisted type factories need to be classes to pass the typescript version of this rule
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
