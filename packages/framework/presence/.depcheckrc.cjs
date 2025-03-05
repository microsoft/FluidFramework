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

		// This mocha plugin is used in the CI pipelines.
		"mocha-multi-reporters",

		// The following deps are reported as missing, but they are available.

		// We use a 'hack' to make plugins from the shared eslint config available to our packages, those these deps are not
		// directly needed in the package.
		"eslint-config-prettier",

		// This reference is flagged because of an unusual import in ./src/datastorePresenceManagerFactory.ts
		"@fluidframework/presence",
	],
	ignorePatterns: [],
};

module.exports = config;
