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
		"client": {
			directory: "",
			ignoredDirs: [],
		},
		"build-tools": "build-tools",
		"server": "server/routerlicious",
		"gitrest": "server/gitrest",
		"historian": "server/historian",

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
			ignoredDirs: ["routerlicious", "tinylicious", "gitrest", "historian"],
		},
	},

	// `flub check policy` config. It applies to the whole repo.
	policy: {
		exclusions: [
			"build-tools/packages/build-tools/src/test/data/",
			"docs/layouts/",
			"docs/themes/thxvscode/assets/",
			"docs/themes/thxvscode/layouts/",
			"docs/themes/thxvscode/static/assets/",
			"docs/tutorials/.*\\.tsx?",
			"azure/packages/azure-local-service/src/index.ts",
			"experimental/PropertyDDS/packages/property-query/test/get_config.js",
			"experimental/PropertyDDS/services/property-query-service/test/get_config.js",
			"server/gitrest/package.json",
			"server/historian/package.json",
			"tools/markdown-magic/test",
			"tools/telemetry-generator/package-lock.json", // Workaround to allow version 2 while we move it to pnpm
		],
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
		// These packages are independently versioned and released, but we use pnpm workspaces in single packages to work
		// around nested pnpm workspace behavior. These packages are not checked for the preinstall script that standard
		// pnpm workspaces should have.
		pnpmSinglePackageWorkspace: [
			"@fluid-tools/api-markdown-documenter",
			"@fluid-tools/benchmark",
			"@fluid-tools/markdown-magic",
			"@fluid-tools/telemetry-generator",
			"@fluidframework/build-common",
			"@fluidframework/common-definitions",
			"@fluidframework/common-utils",
			"@fluidframework/eslint-config-fluid",
			"@fluidframework/protocol-definitions",
			"@fluidframework/test-tools",
			"fluidframework-docs",
			"tinylicious",
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
