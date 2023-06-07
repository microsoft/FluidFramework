/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// For "typetests:gen", it is only needed to be done before the tsc command
// that will build the generated files.  Most of the time it is "build:test"
// but sometimes it is "tsc".  Just include in all of them.

const tscDependsOn = ["^tsc", "build:genver", "typetests:gen"];
/**
 * The settings in this file configure the Fluid build tools, such as fluid-build and flub. Some settings apply to the
 * whole repo, while others apply only to the client release group.
 */
module.exports = {
	tasks: {
		"ci:build": {
			dependsOn: ["compile", "eslint", "ci:build:docs"],
			script: false,
		},
		"full": {
			dependsOn: ["build", "webpack"],
			script: false,
		},
		"build": {
			dependsOn: ["compile", "lint", "build:docs"],
			script: false,
		},
		"compile": {
			dependsOn: ["commonjs", "build:esnext", "build:copy", "build:test"],
			script: false,
		},
		"commonjs": {
			dependsOn: ["tsc", "build:test"],
			script: false,
		},
		"lint": {
			dependsOn: ["prettier", "eslint", "good-fences"],
			script: false,
		},
		"build:copy": [],
		"build:genver": [],
		"typetests:gen": ["^tsc", "build:genver"], // we may reexport type from dependent packages, needs to build them first.
		"tsc": tscDependsOn,
		"build:esnext": tscDependsOn,
		"build:test": [...tscDependsOn, "tsc"],
		"build:docs": [...tscDependsOn, "tsc"],
		"ci:build:docs": [...tscDependsOn, "tsc"],
		"eslint": [...tscDependsOn, "commonjs"],
		"good-fences": [],
		"prettier": [],
		"webpack": ["^tsc", "^build:esnext"],
		"webpack:profile": ["^tsc", "^build:esnext"],
		"clean": [],
	},
	// This defines the layout of the repo for fluid-build. It applies to the whole repo.
	repoPackages: {
		// Release groups
		"client": {
			directory: "",
			ignoredDirs: [],
			defaultInterdependencyRange: "workspace:~",
		},
		"build-tools": {
			directory: "build-tools",
			defaultInterdependencyRange: "workspace:*",
		},
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
		fluidBuildTasks: {
			tsc: {
				ignoreTasks: ["tsc:watch"],
				ignoreDevDependencies: ["@fluid-tools/webpack-fluid-loader"],
			},
		},
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
