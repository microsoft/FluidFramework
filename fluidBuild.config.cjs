/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const tscDependsOn = ["^tsc", "^api", "^build:rename-types", "build:genver"];
/**
 * The settings in this file configure the Fluid build tools, such as fluid-build and flub. Some settings apply to the
 * whole repo, while others apply only to the client release group.
 */
module.exports = {
	tasks: {
		"ci:build": {
			dependsOn: ["compile", "lint", "ci:build:docs", "build:manifest", "build:readme"],
			script: false,
		},
		"full": {
			dependsOn: ["build", "webpack"],
			script: false,
		},
		"build": {
			dependsOn: ["compile", "lint", "build:docs", "build:manifest", "build:readme"],
			script: false,
		},
		"compile": {
			dependsOn: [
				"commonjs",
				"build:esnext",
				"build:test",
				"build:copy",
				"build:rename-types",
			],
			script: false,
		},
		"commonjs": {
			dependsOn: ["tsc", "build:test"],
			script: false,
		},
		"lint": {
			dependsOn: ["prettier", "eslint", "good-fences", "depcruise", "check:release-tags"],
			script: false,
		},
		"checks": {
			dependsOn: ["prettier"],
			script: false,
		},
		"checks:fix": {
			dependsOn: ["^checks:fix"],
			script: false,
		},
		"build:copy": [],
		"build:genver": [],
		"typetests:gen": ["^tsc", "build:genver"], // we may reexport type from dependent packages, needs to build them first.
		"tsc": tscDependsOn,
		"build:esnext": [...tscDependsOn, "^build:esnext"],
		"build:test": [
			...tscDependsOn,
			"typetests:gen",
			"tsc",
			"api-extractor:commonjs",
			"api-extractor:esnext",
		],
		"api": {
			dependsOn: ["api-extractor:commonjs", "api-extractor:esnext"],
			script: false,
		},
		"api-extractor:commonjs": ["tsc"],
		"api-extractor:esnext": ["api-extractor:commonjs", "build:esnext"],
		"build:rename-types": ["build:esnext", "api-extractor:esnext"],
		"build:docs": ["tsc"],
		"ci:build:docs": ["tsc"],
		"build:readme": {
			dependsOn: ["build:manifest"],
			script: true,
		},
		"build:manifest": {
			dependsOn: ["tsc"],
			script: true,
		},
		"depcruise": [],
		"check:release-tags": ["tsc"],
		"check:are-the-types-wrong": ["build"],
		"eslint": [...tscDependsOn, "commonjs"],
		"good-fences": [],
		"prettier": [],
		"prettier:fix": [],
		"webpack": ["^tsc", "^build:esnext"],
		"webpack:profile": ["^tsc", "^build:esnext"],
		"clean": {
			before: ["*"],
		},

		// alias for back compat
		"build:full": {
			dependsOn: ["full"],
			script: false,
		},
		"build:compile": {
			dependsOn: ["compile"],
			script: false,
		},
		"build:commonjs": {
			dependsOn: ["commonjs"],
			script: false,
		},
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
			defaultInterdependencyRange: "workspace:~",
		},
		"server": {
			directory: "server/routerlicious",
			defaultInterdependencyRange: "workspace:~",
		},
		"gitrest": {
			directory: "server/gitrest",
			defaultInterdependencyRange: "^",
		},
		"historian": {
			directory: "server/historian",
			defaultInterdependencyRange: "^",
		},

		// Independent packages
		"build": "common/build",
		"common-def": "common/lib/common-definitions",
		"common-utils": "common/lib/common-utils",
		"protocol-def": "common/lib/protocol-definitions",

		// Tools
		"tools": [
			"tools/api-markdown-documenter",
			"tools/benchmark",
			"tools/changelog-generator-wrapper",
			"tools/getkeys",
			"tools/test-tools",
		],
	},

	// `flub check policy` config. It applies to the whole repo.
	policy: {
		exclusions: [
			"docs/layouts/",
			"docs/themes/thxvscode/assets/",
			"docs/themes/thxvscode/layouts/",
			"docs/themes/thxvscode/static/assets/",
			"docs/tutorials/.*\\.tsx?",
			"server/gitrest/package.json",
			"server/historian/package.json",
			"tools/markdown-magic/test/package.json",
		],
		// Exclusion per handler
		handlerExclusions: {
			"extraneous-lockfiles": [
				"tools/telemetry-generator/package-lock.json", // Workaround to allow version 2 while we move it to pnpm
			],
			"fluid-build-tasks-eslint": [
				// Can be removed once the policy handler is updated to support tsc-multi as equivalent to tsc.
				"^azure/packages/azure-client/package.json",
				"^azure/packages/azure-service-utils/package.json",
				"^experimental/dds/tree2/package.json",
				"^experimental/dds/sequence-deprecated/package.json",
				"^experimental/framework/tree-react-api/package.json",
				"^packages/common/.*/package.json",
				"^packages/dds/.*/package.json",
				"^packages/drivers/.*/package.json",
				"^packages/framework/.*/package.json",
				"^packages/loader/.*/package.json",
				"^packages/runtime/.*/package.json",
				"^packages/service-clients/.*/package.json",
				"^packages/utils/.*/package.json",
				"^packages/loader/container-loader/package.json",
			],
			"html-copyright-file-header": [
				// Tests generate HTML "snapshot" artifacts
				"tools/api-markdown-documenter/src/test/snapshots/.*",
			],
			"js-ts-copyright-file-header": [
				// These files all require a node shebang at the top of the file.
				"azure/packages/azure-local-service/src/index.ts",
				"experimental/PropertyDDS/packages/property-query/test/get_config.js",
				"experimental/PropertyDDS/services/property-query-service/test/get_config.js",
			],
			"package-lockfiles-npm-version": [
				"tools/telemetry-generator/package-lock.json", // Workaround to allow version 2 while we move it to pnpm
			],
			"npm-package-json-scripts-args": [
				// server/routerlicious and server/routerlicious/packages/routerlicious use
				// linux only scripts that would require extra logic to validate properly.
				// Ideally no packages would use OS specific scripts.
				"^server/routerlicious/package.json",
				"^server/routerlicious/packages/routerlicious/package.json",
			],
			"npm-package-json-script-clean": [
				// eslint-config-fluid's build step generate printed configs that are checked in. No need to clean
				"common/build/eslint-config-fluid/package.json",
				// markdown-magic's build step update the README.md file that are checked in. No need to clean.
				"tools/markdown-magic/package.json",
			],
			"npm-package-json-script-mocha-config": [
				// these don't use mocha config for reporters yet.
				"^server/",
				"^build-tools/",
				"^common/lib/common-utils/package.json",
				"^common/build/eslint-config-fluid/package.json",
			],
			"npm-package-json-test-scripts": [
				"common/build/eslint-config-fluid/package.json",
				"packages/test/mocha-test-setup/package.json",
				"examples/apps/attributable-map/package.json",
			],
			"npm-package-json-test-scripts-split": [
				"server/",
				"tools/",
				"package.json",
				"packages/test/test-service-load/package.json",
				"packages/tools/devtools/devtools-browser-extension/package.json",
				"packages/tools/devtools/devtools-view/package.json",
			],
			"npm-package-json-clean-script": [
				// this package has a irregular build pattern, so our clean script rule doesn't apply.
				"^tools/markdown-magic",
				// getKeys has a fake tsconfig.json to make ./eslintrc.cjs work, but we don't need clean script
				"^tools/getkeys",
			],
			"npm-package-json-esm": [
				// These are ESM-only packages and use tsc to build the ESM output. The policy handler doesn't understand this
				// case.
				"packages/dds/migration-shim/package.json",
				"packages/test/functional-tests/package.json",
			],
			// This handler will be rolled out slowly, so excluding most packages here while we roll it out.
			"npm-package-exports-field": [
				// We deliberately improperly import from deep in the package tree while we migrate everything into other
				// packages. This is temporary and can be fixed once the build-tools/build-cli pigration is complete.
				"^build-tools/packages/build-tools/package.json",
				"^common/",
				"^examples/",
				"^experimental/",
				"^packages/",
				"^server/",
				"^tools/",
			],
			"npm-package-json-clean-script": [
				"server/gitrest/package.json",
				"server/historian/package.json",
				"tools/getkeys/package.json",
				"tools/markdown-magic/package.json",
			],
			"npm-strange-package-name": [
				"server/gitrest/package.json",
				"server/historian/package.json",
				"package.json",
			],
			"npm-package-readmes": [
				"server/gitrest/package.json",
				"server/historian/package.json",
				"package.json",
			],
			"npm-package-folder-name": [
				"server/gitrest/package.json",
				"server/historian/package.json",
				"package.json",
			],
			"npm-package-json-script-dep": ["^build-tools/"],
		},
		packageNames: {
			// The allowed package scopes for the repo.
			allowedScopes: [
				"@fluidframework",
				"@fluid-example",
				"@fluid-experimental",
				"@fluid-internal",
				"@fluid-private",
				"@fluid-tools",
			],
			// These packages are known unscoped packages.
			unscopedPackages: ["fluid-framework", "fluidframework-docs", "tinylicious"],

			mustPublish: {
				// These packages will always be published to npm. This is called the "public" feed.
				npm: [
					"@fluidframework",
					"fluid-framework",
					"@fluid-internal/client-utils",
					"tinylicious",
				],
				// A list of packages published to our internal-build feed. Note that packages published
				// to npm will also be published to this feed. This should be a minimal set required for legacy compat of
				// internal partners or internal CI requirements.
				internalFeed: [
					// TODO: We may not need to publish test packages to the internal feed, remove these exceptions if possible.
					"@fluid-internal/test-app-insights-logger",
					"@fluid-internal/test-service-load",
					// Most examples should be private, but table-document needs to publish internally for legacy compat
					"@fluid-example/table-document",
				],
			},
			mayPublish: {
				// These packages may be published to npm in some cases. Policy doesn't enforce this.
				npm: ["@fluid-experimental", "@fluid-tools"],
				// These packages may be published to the internal-build feed in some cases. Policy doesn't enforce this.
				internalFeed: ["@fluid-internal", "@fluid-private"],
			},
		},
		dependencies: {
			// use by npm-package-json-script-dep policy
			// A list of script commands and the package that contains the command
			commandPackages: [
				["api-extractor", "@microsoft/api-extractor"],
				["mocha", "mocha"],
				["rimraf", "rimraf"],
				["tsc", "typescript"],
				["eslint", "eslint"],
				["prettier", "prettier"],
				["webpack", "webpack"],
				["nyc", "nyc"],
				["c8", "c8"],
				["gf", "good-fences"],
				["cross-env", "cross-env"],
				["flub", "@fluid-tools/build-cli"],
				["fluid-build", "@fluidframework/build-tools"],
				["depcruise", "dependency-cruiser"],
				["copyfiles", "copyfiles"],
				["oclif", "oclif"],
				["renamer", "renamer"],
				["tsc-multi", "tsc-multi"],
				["attw", "@arethetypeswrong/cli"],
			],
		},
		// These packages are independently versioned and released, but we use pnpm workspaces in single packages to work
		// around nested pnpm workspace behavior. These packages are not checked for the preinstall script that standard
		// pnpm workspaces should have.
		pnpmSinglePackageWorkspace: [
			"@fluid-private/changelog-generator-wrapper",
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
		],
		fluidBuildTasks: {
			tsc: {
				ignoreTasks: [
					"tsc:watch",
					"watch:devtools",
					"watch:devtools-core",
					"watch:devtools-view",
				],
				ignoreDevDependencies: ["@fluid-tools/webpack-fluid-loader"],
			},
		},
	},

	assertTagging: {
		enabledPaths: [
			/^common\/lib\/common-utils/i,
			/^experimental/i,
			/^packages/i,
			/^server\/routerlicious\/packages\/protocol-base/i,
		],
		assertionFunctions: {
			assert: 1,
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
