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
			dependsOn: ["commonjs", "build:esnext", "^api", "build:test", "build:copy"],
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
		"layerGeneration:gen": [],
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
		"check:are-the-types-wrong": ["tsc", "build:esnext", "api"],
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

		// Non-incremental tasks of convenience to ensure build is up-to-date
		// before command is run. And some aliases for convenience.
		"test:cjs": { dependsOn: ["test:unit:cjs"], script: false },
		"test:esm": { dependsOn: ["test:unit:esm"], script: false },
		"test:jest": ["build:compile"],
		"test:mocha": ["build:test"],
		"test:mocha:cjs": ["build:test:cjs"],
		"test:mocha:esm": ["build:test:esm"],
		"test:unit": { dependsOn: ["test:mocha", "test:jest"], script: false },
		"test:unit:cjs": { dependsOn: ["test:mocha:cjs"], script: false },
		"test:unit:esm": { dependsOn: ["test:mocha:esm"], script: false },

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

	multiCommandExecutables: ["oclif", "syncpack", "tsx"],
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
		// eslint-config-fluid specific declarative task to print configs
		"tsx scripts/print-configs.ts printed-configs": {
			inputGlobs: ["scripts/print-configs.ts", "src/**/*.ts", "src/**/*.tsx", "*.js"],
			outputGlobs: ["printed-configs/*.json"],
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
		"build-common": "common/build/build-common",
		"eslint-plugin-fluid": "common/build/eslint-plugin-fluid",
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

	// Policy config used by Fluid Framework policy handlers.
	// Exclusions and handler exclusions have been migrated to repopo.config.ts.
	// Run `pnpm repopo check` to check policies.
	policy: {
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
			// Note: Breaking changes should be reserved for major releases, which practically speaking means server.
			// Client releases with breaking _legacy_ changes should be in the "legacy" section instead.
			breaking: { heading: "🚨 Breaking Changes" },
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
