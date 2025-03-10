/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

const config = {
	include: ["dependencies"],
	ignoreDependencies: [
		// The following deps are actually in use, but depcheck reports them unused.

		// These packages are used in the CI pipelines.
		"mocha-multi-reporters",
		"moment",

		// The following deps are reported as missing, but they are available.

		// We use a 'hack' to make plugins from the shared eslint config available to our packages, those these deps are not
		// directly needed in the package.
		"@typescript-eslint/eslint-plugin",
		"eslint-config-prettier",
		"eslint-import-resolver-typescript",
		"eslint-plugin-tsdoc",
		"eslint-plugin-unicorn",
	],
};

module.exports = config;