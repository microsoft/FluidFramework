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
			"^.*",
		],
		// Exclusion per handler
		handlerExclusions: {
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
