/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from 'eslint';

import { minimalDeprecated } from '../../../common/build/eslint-config-fluid/flat.mts';

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-shadow': 'off',
			'no-shadow': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'import-x/no-deprecated': 'off',
			'@fluid-internal/fluid/no-unchecked-record-access': 'off',
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
