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
 * @type {import("@fluidframework/build-tools").IFluidBuildConfig}
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
			dependsOn: ["build:manifest"],
			script: true,
		},
		"build:manifest": {
			dependsOn: ["tsc"],
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
};
