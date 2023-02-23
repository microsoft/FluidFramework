/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The settings in this file configure the Fluid build tools, such as fluid-build and flub. Some settings apply to the
 * whole repo, while others apply only to the client release group.
 */
module.exports = {
	// This defines the layout of the repo for fluid-build. It applies to the whole repo.
	repoPackages: {
		// Release groups
		"azure": "azure",
		"client": {
			directory: "",
			ignoredDirs: [],
		},
		"build-tools": "build-tools",
		"server": "server/routerlicious",

		// Independent packages
		"build": "common/build",
		"common-def": "common/lib/common-definitions",
		"common-utils": "common/lib/common-utils",
		"protocol-def": "common/lib/protocol-definitions",

		// Tools
		"tools": [
			"tools/api-markdown-documenter",
			"tools/benchmark",
			"tools/getkeys",
			"tools/test-tools",
			"server/tinylicious",
		],

		// Services
		"services": {
			directory: "server",
			ignoredDirs: ["routerlicious", "tinylicious"],
		},
	},

	// `flub check policy` config. It applies to the whole repo.
	policy: {
		dependencies: {
			// Packages require tilde dependencies
			requireTilde: [
				"@typescript-eslint/eslint-plugin",
				"@typescript-eslint/parser",
				"eslint-config-prettier",
				"eslint-plugin-eslint-comments",
				"eslint-plugin-import",
				"eslint-plugin-unicorn",
				"eslint-plugin-unused-imports",
				"eslint",
				"prettier",
				"typescript",
				"webpack-dev-server",
			],
		},

		// Lockfiles should only be found at these paths in the repo
		additionalLockfilePaths: [
			"common/build/build-common",
			"common/build/eslint-config-fluid",
			"docs",
			"server/gitrest",
			"server/historian",
			"tools/telemetry-generator",
		],
	},

	// This defines the branch release types for type tests. It applies only to the client release group. Settings for
	// other release groups is in their root fluid-build config.
	branchReleaseTypes: {
		"main": "minor",
		"lts": "minor",
		"release/**": "patch",
		"next": "major",
	},
};
