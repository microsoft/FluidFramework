/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export default {

	// Knip has the capability to report many issue types. For now we are only using "dependencies" to check for unused dependency declaration in package.json
	// In future, we can expand our requirements to report other issue types as well, for example: unused files, or unused exports etc.
	// See: https://knip.dev/reference/cli#--include
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