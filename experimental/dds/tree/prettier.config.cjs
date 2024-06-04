/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	...require('@fluidframework/build-common/prettier.config.cjs'),
	arrowParens: 'always',
	endOfLine: 'auto',
	printWidth: 120,
	singleQuote: true,
	tabWidth: 4,
	trailingComma: 'es5',
	useTabs: true,
	overrides: [
		{
			files: 'tsconfig*.json',
			options: {
				singleQuote: false,
			},
		},
	],
};
