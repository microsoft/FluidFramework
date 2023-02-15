/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	indent: "\t",

	// Don't set dep versions based on the version of the package in the workspace
	workspace: false,

	// Custom types are used to define additional fields in package.json that contain versions that should be
	// checked/synced. See https://github.com/JamieMason/syncpack/blob/master/README.md#customtypes for more details.
	customTypes: {
		enginesNpm: {
			path: "engines.npm",
			strategy: "version",
		},
		enginesNode: {
			path: "engines.node",
			strategy: "version",
		},
		packageManager: {
			path: "packageManager",
			strategy: "name@version",
		},
	},

	// semverGroup rules are applied in order to package/dep combinations. First matching rule applies. When running
	// `syncpack lint-semver-ranges`, the output is grouped into numbered groups. However, the numbers of the groups are
	// the _inverse_ of their order in this array. That is, Semver Group 1 in the output will correspond to the _last_
	// rule in this array.
	semverGroups: [
		// GROUP 8
		// engines.node should always use >= range
		{
			dependencyTypes: ["enginesNode"],
			dependencies: ["**"],
			packages: ["**"],
			range: ">=",
		},

		// GROUP 7
		// engines.npm should always use ^ range
		{
			dependencyTypes: ["enginesNpm"],
			dependencies: ["**"],
			packages: ["**"],
			range: "^",
		},

		// GROUP 6
		// packageManager should always use exact version
		{
			dependencyTypes: ["packageManager"],
			dependencies: ["**"],
			packages: ["**"],
			range: "",
		},

		// GROUP 5
		// PropertyDDS packages' dependencies are ignored because they use a lot of exact deps.
		{
			dependencies: ["**"],
			packages: ["@fluid-experimental/property-*"],
			isIgnored: true,
		},

		// GROUP 4
		// Dependencies declared in pnpm overrides should use caret.
		{
			dependencyTypes: ["pnpmOverrides"],
			dependencies: ["**"],
			packages: ["**"],
			range: "^",
		},

		// GROUP 3
		// These dependencies should always be on exact versions
		{
			dependencies: [
				"@tiny-calc/*",
				"@graphql-codegen/cli",
				"@graphql-codegen/typescript",
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

		// GROUP 2
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

		// GROUP 1
		// All deps should use caret ranges unless previously overridden
		{
			dependencies: ["**"],
			dependencyTypes: ["dev", "peer", "prod"],
			packages: ["**"],
			range: "^",
		},
	],

	// versionGroup rules are applied in order to package/dep combinations. First matching rule applies. When running
	// `syncpack list-mismatches`, the output is grouped into numbered groups. However, the numbers of the groups are
	// the _inverse_ of their order in this array. That is, Version Group 1 in the output will correspond to the _last_
	// rule in this array.
	versionGroups: [
		// GROUP 3
		// engines.npm field should match
		{
			dependencyTypes: ["enginesNpm"],
			dependencies: ["**"],
			packages: ["**"],
		},

		// GROUP 2
		// packageManager field versions should match
		{
			dependencyTypes: ["packageManager"],
			dependencies: ["**"],
			packages: ["**"],
		},

		// GROUP 1
		// If unmatched by earlier rules, ignore. This is needed because syncpack doesn't understand our >= < semver ranges.
		{
			packages: ["**"],
			dependencies: ["**"],
			isIgnored: true,
		},
	],
};
