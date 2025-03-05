/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

/**
 * @type {import("depcheck").Config}
 */
const config = {
	ignores: [
		// The following deps are actually in use, but depcheck reports them unused.

		// Oclif plugins are used dynamically at runtime.
		"@oclif/plugin-*",

		// Danger is used at runtime in the dangerfile.
		"danger",

		// Types from this package are used in markdown.ts.
		"mdast",

		// This is needed by the fluid-build task integration in policy-check.
		"tslib",

		// We use a 'hack' to make plugins from the shared eslint config available to our packages, those these deps are not
		// directly needed in the package.
		"@typescript-eslint/eslint-plugin",
		"eslint-import-resolver-typescript",
		"eslint-plugin-tsdoc",
		"eslint-plugin-unicorn",
	],
	ignorePatterns: [],
};

module.exports = config;
