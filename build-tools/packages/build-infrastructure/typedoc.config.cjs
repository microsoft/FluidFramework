/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
	entryPoints: [
		"./src/index.ts",
		// "./src/array.ts",
		// "./src/git.ts",
		// "./src/set.ts",
	],
	plugin: ["typedoc-plugin-markdown"],
	gitRevision: "main",
	sourceLinkTemplate:
		"https://github.com/microsoft/FluidFramework/blob/{gitRevision}/{path}#L{line}",
	outputFileStrategy: "members",
	out: "docs",
	// entryModule: "index",
	readme: "./README.md",
	// modulesFileName: "documentation",
	mergeReadme: true,
	projectDocuments: ["./src/docs/cli.md"],
	defaultCategory: "API",
	categorizeByGroup: true,
	navigation: {
		includeCategories: false,
		includeGroups: false,
		includeFolders: false,
	},
	useCodeBlocks: true,
};
