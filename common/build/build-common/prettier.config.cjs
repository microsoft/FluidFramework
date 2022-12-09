/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Shared prettier configuration for use in across the fluid-framework repository.
// Individual packages may extend this and override rules as needed, though for consistent formatting, package-local
// overrides should be avoided unless absolutely necessary.
module.exports = {
	printWidth: 100,
	quoteProps: "consistent",
	semi: true,
	singleQuote: false,
	tabWidth: 4,
	trailingComma: "all",
	useTabs: true, // changed from false to true
	overrides: [
		{
			files: "lerna.json",
			options: {
				printWidth: 50,
				tabWidth: 2,
			},
		},
		{
			files: "tsconfig*.json",
			options: {
				parser: "json5",
				tabWidth: 2,
				trailingComma: "all",
				quoteProps: "preserve",
			},
		},
		{
			files: "*.json",
			options: {
				tabWidth: 2,
				trailingComma: "all",
				quoteProps: "preserve",
			},
		},
	],
};
