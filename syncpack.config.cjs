/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	indent: "\t",

	// Don't set dep versions based on the version of the package in the workspace
	workspace: false,

	// Custom types are used to define additional fields in package.json that contain versions that should be
	// checked/synced. See https://jamiemason.github.io/syncpack/config/custom-types for more details.
	customTypes: {
		engines: {
			path: "engines",
			strategy: "versionsByName",
		},
		packageManager: {
			path: "packageManager",
			strategy: "name@version",
		},
	},

	/**
	 * SemverGroups are used to ensure that groups of packages use the same semver range for dependencies.
	 *
	 * semverGroup rules are applied in order to package/dep combinations. First matching rule applies. When running
	 * `syncpack lint-semver-ranges`, the output is grouped into numbered groups.
	 */
	semverGroups: [
		// Semver Group 1
		// engines.node should always use >= range
		{
			dependencyTypes: ["engines"],
			dependencies: ["node"],
			packages: ["**"],
			range: ">=",
		},

		// Semver Group 2
		// engines.npm should always use ^ range
		{
			dependencyTypes: ["engines"],
			dependencies: ["npm"],
			packages: ["**"],
			range: "^",
		},

		// Semver Group 3
		// packageManager should always use exact version
		{
			dependencyTypes: ["packageManager"],
			dependencies: ["**"],
			packages: ["**"],
			range: "",
		},

		// Semver Group 4
		// PropertyDDS packages' dependencies are ignored because they use a lot of exact deps.
		{
			dependencies: ["**"],
			packages: ["@fluid-experimental/property-*"],
			isIgnored: true,
		},

		// Semver Group 5
		// Dependencies declared in pnpm overrides should use caret.
		{
			dependencyTypes: ["pnpmOverrides"],
			dependencies: ["**"],
			packages: ["**"],
			range: "^",
		},

		// Semver Group 6
		// These dependencies should always be on exact versions
		{
			dependencies: [
				"@tiny-calc/*",
				"@graphql-codegen/cli",
				"@graphql-codegen/typescript",
				"@material-ui/*",
				"@types/chrome",
				"@types/codemirror",
				"@types/expect-puppeteer",
				"@types/jest-environment-puppeteer",
				"@types/jest",
				"@types/puppeteer",
				"@types/url-parse",
				"fake-indexeddb",
				"json-stringify-safe",
				"tinylicious",
				"yargs",
			],
			packages: ["**"],
			range: "",
		},

		// Semver Group 7
		// Some dependencies, like typescript and eslint, recommend to use tilde deps because minors introduce
		// changes that may break linting
		{
			dependencies: [
				"eslint-plugin-*",
				"eslint-config-prettier",
				"eslint",
				"less",
				"prettier",
				"typescript",
				"vue",
				"webpack-dev-server",
			],
			packages: ["**"],
			range: "~",
		},

		// Semver Group 8
		// All deps should use caret ranges unless previously overridden
		{
			dependencies: ["**"],
			dependencyTypes: ["dev", "peer", "prod"],
			packages: ["**"],
			range: "^",
		},
	],

	/**
	 *  VersionGroups are used to ensure that groups of packages use the same version of dependencies.
	 *
	 * versionGroup rules are applied in order to package/dep combinations. First matching rule applies. When running
	 * `syncpack list-mismatches`, the output is grouped into numbered groups.
	 */
	versionGroups: [
		// Version Group 1
		// All dependencies on these common Fluid packages outside the release group should match
		{
			dependencies: [
				"@fluidframework/build-common",
				"@fluidframework/eslint-config-fluid",
				"@fluidframework/build-tools",
				"@fluid-tools/build-cli",
			],
			packages: ["**"],
		},

		// Version Group 2
		// engines.node and engines.npm versions should match
		{
			dependencyTypes: ["engines"],
			dependencies: ["**"],
			packages: ["**"],
		},

		// Version Group 3
		// packageManager versions should match, though this field is only used in the release group root
		// package.json today.
		{
			dependencyTypes: ["packageManager"],
			dependencies: ["**"],
			packages: ["**"],
		},

		// Version Group 4
		// Ignore interdependencies on other Fluid packages. This is needed because syncpack doesn't understand our
		// >= < semver ranges.
		{
			isIgnored: true,
			packages: [
				"@fluid-example/**",
				"@fluid-experimental/**",
				"@fluid-internal/**",
				"@fluid-tools/**",
				"@fluidframework/**",
				"fluid-framework",
			],
			dependencies: [
				"@fluid-example/**",
				"@fluid-experimental/**",
				"@fluid-internal/**",
				"@fluid-tools/**",
				"@fluidframework/**",
				"fluid-framework",
			],
		},
	],
};
