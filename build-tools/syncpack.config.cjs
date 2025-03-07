/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	indent: "\t",

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
	 * `syncpack lint-semver-ranges`, the output is grouped by label.
	 */
	semverGroups: [
		{
			label: "engines.node should always use >= ranges",
			dependencyTypes: ["engines"],
			dependencies: ["node"],
			packages: ["**"],
			range: ">=",
		},

		{
			label: "engines.npm should always use caret ranges",
			dependencyTypes: ["engines"],
			dependencies: ["npm"],
			packages: ["**"],
			range: "^",
		},

		{
			label: "packageManager should always use exact dependency ranges",
			dependencyTypes: ["packageManager"],
			dependencies: ["**"],
			packages: ["**"],
			range: "",
		},

		{
			label: "Overridden server dependencies should always be exact versions",
			dependencyTypes: ["pnpmOverrides"],
			dependencies: [
				"@fluidframework/gitresources",
				"@fluidframework/protocol-base",
				"@fluidframework/server-*",
			],
			packages: ["**"],
			range: "",
		},

		{
			label: "Ignore unsupported pnpm overidde entries",
			dependencyTypes: ["pnpmOverrides"],
			dependencies: ["json5@<1.0.2", "json5@>=2.0.0 <2.2.2", "oclif>@aws-sdk/client*"],
			packages: ["build-tools-release-group-root"],
			isIgnored: true,
		},

		{
			label: "Deps in pnpm overrides should use caret dependency ranges",
			dependencyTypes: ["pnpmOverrides"],
			dependencies: ["**"],
			packages: ["**"],
			range: "^",
		},

		{
			label: "Must use exact dependency ranges",
			dependencies: ["sort-package-json"],
			packages: ["**"],
			range: "",
		},

		// Some dependencies, like typescript and eslint, recommend to use tilde deps because minors introduce
		// changes that may break linting
		{
			label: "Must use tilde dependency ranges",
			dependencies: [
				"@biomejs/biome",
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

		{
			label:
				"Dependencies on build-tools at the root of the release group must use tilde dependency ranges",
			dependencies: ["@fluid-tools/build-cli", "@fluidframework/build-tools"],
			packages: ["build-tools-release-group-root"],
			range: "~",
		},

		{
			label:
				"Dependencies on other fluid packages within the workspace should use tilde dependency ranges",
			dependencies: [
				"@fluid-tools/build-cli",
				"@fluid-tools/build-infrastructure",
				"@fluid-tools/version-tools",
				"@fluidframework/build-tools",
				"@fluidframework/bundle-size-tools",
				"@fluidframework/build-tools-bin",
			],
			packages: ["**"],
			range: "~",
		},

		// All deps should use caret ranges unless previously overridden
		{
			label: "Dependencies should use caret dependency ranges",
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
	 * `syncpack list-mismatches`, the output is grouped by label.
	 */
	versionGroups: [
		{
			label: "chalk >2 is ESM only but build-tools and version-tools are still CJS only.",
			dependencies: ["chalk"],
			packages: ["@fluidframework/build-tools", "@fluid-tools/version-tools"],
		},

		{
			label: "Versions of common Fluid packages should all match",
			dependencies: [
				"@fluidframework/build-common",
				"@fluidframework/common-utils",
				"@fluidframework/eslint-config-fluid",
			],
			packages: ["**"],
		},

		{
			label: "Versions in engines field should all match",
			dependencyTypes: ["engines"],
			dependencies: ["**"],
			packages: ["**"],
		},

		{
			label: "Versions in packageManager field should all match",
			dependencyTypes: ["packageManager"],
			dependencies: ["**"],
			packages: ["**"],
		},

		{
			label:
				"Ignore interdependencies on other Fluid packages. This is needed because syncpack doesn't understand our >= < semver ranges",
			isIgnored: true,
			packages: [
				"@fluid-example/**",
				"@fluid-experimental/**",
				"@fluid-internal/**",
				"@fluid-private/**",
				"@fluid-tools/**",
				"@fluidframework/**",
				"fluid-framework",
			],
			dependencies: [
				"@fluid-example/**",
				"@fluid-experimental/**",
				"@fluid-internal/**",
				"@fluid-private/**",
				"@fluid-tools/**",
				"@fluidframework/**",
				"fluid-framework",
			],
		},
	],
};
