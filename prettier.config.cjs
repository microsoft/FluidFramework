/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	...require("@fluidframework/build-common/prettier.config.cjs"),

	// TODO: These overrides can be removed once this release group is updated to build-common 1.2.0.
	overrides: [
		{
			// Some JSON files are only ever used by JSON5-aware tools
			files: ["tsconfig*.json", ".vscode/*.json"],
			options: {
				parser: "json5",
				tabWidth: 2,
				quoteProps: "preserve",
			},
		},
		{
			files: "*.json",
			options: {
				tabWidth: 2,
				quoteProps: "preserve",
			},
		},
		{
			// YAML formatting should not use tabs, and use a 2-space indent instead
			files: ["*.yaml", "*.yml"],
			options: {
				tabWidth: 2,
				useTabs: false,
				quoteProps: "preserve",
			},
		},
	],
};
