/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

const tscDependsOn = ["^tsc", "^api", "build:genver", "ts2esm"];

/**
 * The settings in this file configure the Fluid build tools, such as fluid-build and flub. Some settings apply to the
 * whole repo, while others apply only to the client release group.
 *
 * See https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-tools/src/common/fluidTaskDefinitions.ts
 * for details on the task and dependency definition format.
 *
 * @type {import("@fluidframework/build-tools").IFluidBuildConfig & import("@fluid-tools/build-cli").FlubConfig}
 */
module.exports = {
	version: 1,
	tasks: {
		"ci:build": {
			dependsOn: [
				"compile",
				"lint",
				"ci:build:api-reports",
				"ci:build:docs",
				"build:manifest",
				"build:readme",
			],
			script: false,
		},
		"full": {
			dependsOn: ["build", "webpack"],
			script: false,
		},
		"build": {
			dependsOn: [
				"check:format",
				"compile",
				"lint",
				"build:api-reports",
				"build:docs",
				"build:manifest",
				"build:readme",
			],
			script: false,
		},
		"compile": {
			dependsOn: ["commonjs", "build:esnext", "api", "build:test", "build:copy"],
			script: false,
		},
		"commonjs": {
			dependsOn: ["tsc", "build:test"],
			script: false,
		},
		"lint": {
			dependsOn: ["eslint", "good-fences", "depcruise", "check:exports", "check:release-tags"],
			script: false,
		},
		"checks": {
			dependsOn: ["check:format"],
			script: false,
		},
		"checks:fix": {
			dependsOn: [],
			script: false,
		},
		"build:copy": [],
		"build:genver": [],
		"typetests:gen": [],
		"ts2esm": [],
		"tsc": tscDependsOn,
		"build:esnext": [...tscDependsOn, "^build:esnext"],
		// Generic build:test script should be replaced by :esm or :cjs specific versions.
		// "tsc" would be nice to eliminate from here, but plenty of packages still focus
		// on CommonJS.
		"build:test": ["typetests:gen", "tsc", "api-extractor:commonjs", "api-extractor:esnext"],
		"build:test:cjs": ["typetests:gen", "tsc", "api-extractor:commonjs"],
		"build:test:esm": ["typetests:gen", "build:esnext", "api-extractor:esnext"],
		"api": {
			dependsOn: ["api-extractor:commonjs", "api-extractor:esnext"],
			// dependsOn: ["api-extractor:commonjs", "api-extractor:esnext"],
			script: false,
		},
		"api-extractor:commonjs": ["tsc"],
		"api-extractor:esnext": {
			dependsOn: ["build:esnext"],
			script: true,
		},
		// build:api-reports may be handled in one step with build:docs when a
		// package only uses api-extractor supported exports, which is a single
		// export/entrypoint. For packages with /legacy exports, we need to
		// generate reports from legacy entrypoint as well as the "current" one.
		// The "current" entrypoint should be the broadest of "public.d.ts",
		// "beta.d.ts", and "alpha.d.ts".
		"build:api-reports:current": ["api-extractor:esnext"],
		"build:api-reports:legacy": ["api-extractor:esnext"],
		"ci:build:api-reports:current": ["api-extractor:esnext"],
		"ci:build:api-reports:legacy": ["api-extractor:esnext"],
		// With most packages in client building ESM first, there is ideally just "build:esnext" dependency.
		// The package's local 'api-extractor.json' may use the entrypoint from either CJS or ESM,
		// therefore we need to require both before running api-extractor.
		"build:docs": ["tsc", "build:esnext"],
		"ci:build:docs": ["tsc", "build:esnext"],
		"build:readme": {
			dependsOn: ["compile"],
			script: true,
		},
		"build:manifest": {
			dependsOn: ["compile"],
			script: true,
		},
		"depcruise": [],
		"check:exports": ["api"],
		// The package's local 'api-extractor-lint.json' may use the entrypoint from either CJS or ESM,
		// therefore we need to require both before running api-extractor.
		"check:release-tags": ["tsc", "build:esnext"],
		"check:are-the-types-wrong": ["build"],
		"check:format": {
			dependencies: [],
			script: true,
		},
		"format": {
			dependencies: [],
			script: true,
		},
		"check:biome": [],
		"check:prettier": [],
		// ADO #7297: Review why the direct dependency on 'build:esm:test' is necessary.
		//            Should 'compile' be enough?  compile -> build:test -> build:test:esm
		"eslint": ["compile", "build:test:esm"],
		"good-fences": [],
		"format:biome": [],
		"format:prettier": [],
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

	multiCommandExecutables: ["oclif", "syncpack"],
	declarativeTasks: {
		// fluid-build lowercases the executable name, so we need to use buildversion instead of buildVersion.
		"flub check buildversion": {
			inputGlobs: [
				"package.json",

				// release group packages; while ** is supported, it is very slow, so these entries capture all the levels we
				// have packages at today. Once we can upgrade to a later version of
				// globby things might be faster.
				"{azure,examples,experimental,packages}/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/*/package.json",
				"tools/markdown-magic/package.json",
			],
			outputGlobs: ["package.json"],
			gitignore: ["input", "output"],
		},
		"jssm-viz": {
			inputGlobs: ["src/**/*.fsl"],
			outputGlobs: ["src/**/*.fsl.svg"],
		},
		"markdown-magic": {
			inputGlobs: [],
			outputGlobs: [
				// release group packages; while ** is supported, it is very slow, so these entries capture all the levels we
				// have generated markdown files at today. Once we can upgrade to a later version of
				// globby things might be faster.
				"{azure,examples,experimental,packages}/*/*/*.md",
				"{azure,examples,experimental,packages}/*/*/*/*.md",
				"{azure,examples,experimental,packages}/*/*/*/*/*.md",
				"tools/markdown-magic/**/*.md",
			],
			gitignore: ["input", "output"],
		},
		"oclif manifest": {
			inputGlobs: ["package.json", "src/**"],
			outputGlobs: ["oclif.manifest.json"],
		},
		"oclif readme": {
			inputGlobs: ["package.json", "src/**"],
			outputGlobs: ["README.md", "docs/**"],
		},
		"syncpack lint-semver-ranges": {
			inputGlobs: [
				"syncpack.config.cjs",
				"package.json",

				// release group packages; while ** is supported, it is very slow, so these entries capture all the levels we
				// have packages at today. Once we can upgrade to a later version of
				// globby things might be faster.
				"{azure,examples,experimental,packages}/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/*/package.json",
				"tools/markdown-magic/package.json",
			],
			outputGlobs: [
				"package.json",

				// release group packages; while ** is supported, it is very slow, so these entries capture all the levels we
				// have packages at today. Once we can upgrade to a later version of
				// globby things might be faster.
				"{azure,examples,experimental,packages}/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/*/package.json",
				"tools/markdown-magic/package.json",
			],
			gitignore: ["input", "output"],
		},
		"syncpack list-mismatches": {
			inputGlobs: [
				"syncpack.config.cjs",
				"package.json",

				// release group packages; while ** is supported, it is very slow, so these entries capture all the levels we
				// have packages at today. Once we can upgrade to a later version of
				// globby things might be faster.
				"{azure,examples,experimental,packages}/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/*/package.json",
				"tools/markdown-magic/package.json",
			],
			outputGlobs: [
				"package.json",

				// release group packages; while ** is supported, it is very slow, so these entries capture all the levels we
				// have packages at today. Once we can upgrade to a later version of
				// globby things might be faster.
				"{azure,examples,experimental,packages}/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/package.json",
				"{azure,examples,experimental,packages}/*/*/*/*/package.json",
				"tools/markdown-magic/package.json",
			],
			gitignore: ["input", "output"],
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
		},
		"server": {
			directory: "server/routerlicious",
		},
		"gitrest": {
			directory: "server/gitrest",
		},
		"historian": {
			directory: "server/historian",
		},

		// Independent packages
		"build": "common/build",
		"common-utils": "common/lib/common-utils",
		"protocol-def": "common/lib/protocol-definitions",

		// Tools
		"tools": [
			"tools/api-markdown-documenter",
			"tools/benchmark",
			"tools/getkeys",
			"tools/test-tools",
		],
	},

	// `flub check policy` config. It applies to the whole repo.
	policy: {
		// Entries here are COMPLETELY ignored by the policy checker. Instead of adding entries here, consider adding
		// entries to the handlerExclusions list below to ignore a particular.
		exclusions: [
			// The paths below are for fluidframework.com layouts and code and are not subject to policy.
			"docs/layouts/",
			"docs/themes/thxvscode/assets/",
			"docs/themes/thxvscode/layouts/",
			"docs/themes/thxvscode/static/assets/",

			// This file is a test file.
			"tools/markdown-magic/test/package.json",

			// Not a real package
			"docs/api/",

			// Source to output package.json files - not real packages
			// These should only be files that are not in an pnpm workspace.
			"common/build/build-common/src/cjs/package.json",
			"common/build/build-common/src/esm/package.json",
			"packages/framework/presence/src/cjs/package.json",
		],
		// Exclusion per handler
		handlerExclusions: {
			"fluid-build-tasks-eslint": [
				// eslint doesn't really depend on build. Doing so just slows down a package build.
				"^packages/test/snapshots/package.json",
				"^packages/test/test-utils/package.json",
				// TODO: AB#7630 uses lint only ts projects for coverage which don't have representative tsc scripts
				"^packages/tools/fluid-runner/package.json",
			],
			"fluid-build-tasks-tsc": [],
			"html-copyright-file-header": [
				// Tests generate HTML "snapshot" artifacts
				"tools/api-markdown-documenter/src/test/snapshots/.*",
			],
			"js-ts-copyright-file-header": [
				// These files all require a node shebang at the top of the file.
				"azure/packages/azure-local-service/src/index.ts",
				"experimental/PropertyDDS/packages/property-query/test/get_config.js",
				"server/routerlicious/packages/tinylicious/src/index.ts",

				// Type test files can be excluded since they're generated and known to have the correct header.
				// This can be removed once the whole repo uses build-tools v0.35.0+.
				/.*\/validate.*\.generated\.ts/,
			],
			"no-js-file-extensions": [
				// PropertyDDS uses .js files which should be renamed eventually.
				"experimental/PropertyDDS/.*",
				"build-tools/packages/build-cli/bin/dev.js",
				"build-tools/packages/build-cli/bin/run.js",
				"build-tools/packages/build-cli/test/helpers/init.js",
				"build-tools/packages/version-tools/bin/dev.js",
				"build-tools/packages/version-tools/bin/run.js",
				"common/build/build-common/gen_version.js",
				"common/build/eslint-config-fluid/.*",
				"common/lib/common-utils/jest-puppeteer.config.js",
				"common/lib/common-utils/jest.config.js",
				"common/build/eslint-plugin-fluid/.*",
				"docs/api-markdown-documenter/.*",
				"docs/api/fallback/index.js",
				"docs/build-redirects.js",
				"docs/download-apis.js",
				"docs/local-api-rollup.js",
				"docs/static/js/add-code-copy-button.js",
				"examples/data-objects/monaco/loaders/blobUrl.js",
				"examples/data-objects/monaco/loaders/compile.js",
				"examples/service-clients/odsp-client/shared-tree-demo/tailwind.config.js",
				"packages/test/mocha-test-setup/mocharc-common.js",
				"packages/test/test-service-load/scripts/usePrereleaseDeps.js",
				"packages/tools/devtools/devtools-browser-extension/test-setup.js",
				"tools/changelog-generator-wrapper/src/getDependencyReleaseLine.js",
				"tools/changelog-generator-wrapper/src/getReleaseLine.js",
				"tools/changelog-generator-wrapper/src/index.js",
				"tools/getkeys/index.js",
			],
			"npm-package-metadata-and-sorting": [
				// The root package.json is not checked temporarily due to AB#8640
				"^package.json",
			],
			"npm-package-json-prettier": [
				// This rule is temporarily disabled for all projects while we update the repo to use different formatting
				".*",
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
			"npm-package-exports-apis-linted": [
				// Rollout suppressions - enable only after tools are updated to support policy
				// as new build-tools will have the concurrently fluid-build support it uses.
				"^common/",

				// Packages that violate the API linting rules
				// ae-missing-release-tags, ae-incompatible-release-tags
				"^examples/data-objects/table-document/",
				// AB#8147: ./test/EditLog export should be ./internal/... or tagged for support
				"^experimental/dds/tree/",

				// Packages with APIs that don't need strict API linting
				"^build-tools/",
				"^common/build/",
				"^experimental/PropertyDDS/",
				"^tools/api-markdown-documenter/",
			],
			// This handler will be rolled out slowly, so excluding most packages here while we roll it out.
			"npm-package-exports-field": [
				// We deliberately improperly import from deep in the package tree while we migrate everything into other
				// packages. This is temporary and can be fixed once the build-tools/build-cli pigration is complete.
				"^azure/",
				"^build-tools/packages/build-tools/package.json",
				"^build-tools/packages/build-infrastructure/package.json",
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
				// getKeys has a fake tsconfig.json to make ./eslintrc.cjs work, but we don't need clean script
				"tools/getkeys/package.json",
				// this package has a irregular build pattern, so our clean script rule doesn't apply.
				"tools/markdown-magic/package.json",
				// Docs directory breaks cleaning down into multiple scripts.
				"docs/package.json",
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
			"npm-package-json-script-dep": [],
			"npm-package-license": [
				// test packages
				"^build-tools/packages/build-infrastructure/src/test/data/testRepo/",
			],
			"npm-private-packages": [
				// test packages
				"^build-tools/packages/build-infrastructure/src/test/data/testRepo/",
			],
			"pnpm-npm-package-json-preinstall": [
				// test packages
				"^build-tools/packages/build-infrastructure/src/test/data/testRepo/",
			],
			"npm-check-unused-dependencies": [
				// Omitting all directories for now as there are many unused dependency reported. The following exclusion list will continue reduce
				// as we progressively fix the unused dependency errors.
				"^azure",
				"^build-tools/",
				"^common/",
				"^docs/",
				"^examples/",
				"^experimental/",
				"^packages/common",
				"^packages/dds",
				"^packages/drivers",
				"^packages/framework",
				"^packages/loader",
				"^packages/runtime",
				"^packages/service-clients",
				"^packages/test",
				"^packages/tools",
				"^packages/utils",
				"^server/charts/",
				"^server/gitrest/",
				"^server/gitssh/",
				"^server/historian/",
				"^server/routerlicious/",
				"^tools/",
				"^package.json",
				/^\.changeset\//,
				/^\.github\//,
				/^\.vscode\//,
			],
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
					"@fluid-internal/mocha-test-setup",
					"@fluid-internal/test-driver-definitions",
					"tinylicious",
				],
				// A list of packages published to our internal-build feed. Note that packages published
				// to npm will also be published to this feed. This should be a minimal set required for legacy compat of
				// internal partners or internal CI requirements.
				internalFeed: [
					// TODO: We may not need to publish test packages to the internal feed, remove these exceptions if possible.
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
				["attw", "@arethetypeswrong/cli"],
				["biome", "@biomejs/biome"],
				["c8", "c8"],
				["concurrently", "concurrently"],
				["copyfiles", "copyfiles"],
				["cross-env", "cross-env"],
				["depcruise", "dependency-cruiser"],
				["eslint", "eslint"],
				["flub", "@fluid-tools/build-cli"],
				["fluid-build", "@fluidframework/build-tools"],
				["gf", "good-fences"],
				["mocha", "mocha"],
				["nyc", "nyc"],
				["oclif", "oclif"],
				["prettier", "prettier"],
				["rimraf", "rimraf"],
				["tinylicious", "tinylicious"],
				["ts2esm", "ts2esm"],
				["tsc", "typescript"],
				["webpack", "webpack"],
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
			"@fluidframework/build-common",
			"@fluidframework/common-utils",
			"@fluidframework/eslint-config-fluid",
			"@fluid-internal/eslint-plugin-fluid",
			"@fluidframework/protocol-definitions",
			"@fluidframework/test-tools",
			"fluidframework-docs",
		],
		fluidBuildTasks: {
			tsc: {
				ignoreDevDependencies: ["@fluid-example/webpack-fluid-loader"],
				ignoreTasks: [
					// Outside of normal build and packages/dd/matrix version includes tsc
					"bench:profile",
				],
			},
		},
		// Requirements applied to all `public` packages.
		publicPackageRequirements: {
			// The following scripts combined with npm-package-exports-apis-linted policy are all currently required
			// to ensure api-extractor is run correctly in local builds and pipelines.
			requiredScripts: [
				// TODO: Add as a requirement once all packages have been updated to produce dual esm/commonjs builds
				// {
				// 	name: "api",
				// 	body: "fluid-build . --task api",
				// },
			],
			requiredDevDependencies: [],
		},
	},

	assertTagging: {
		enabledPaths: [/^common\/lib\/common-utils/i, /^experimental/i, /^packages/i],
	},

	// `flub bump` config. These settings influence `flub bump` behavior for a release group. These settings can be
	// overridden usig explicit CLI flags like `--interdependencyRange`.
	bump: {
		defaultInterdependencyRange: {
			"client": "workspace:~",
			"build-tools": "workspace:~",
			"server": "workspace:~",
			"gitrest": "^",
			"historian": "^",
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

	releaseNotes: {
		sections: {
			feature: { heading: "✨ New Features" },
			tree: { heading: "🌳 SharedTree DDS Changes" },
			fix: { heading: "🐛 Bug Fixes" },
			deprecation: { heading: "⚠️ Deprecations" },
			legacy: { heading: "Legacy API Changes" },
			other: { heading: "Other Changes" },
		},
	},

	// This setting influence `flub release report` behavior. This defines the legacy compat range for release group or independent packages.
	releaseReport: {
		legacyCompatInterval: {
			"client": 10,
		},
	},
};
