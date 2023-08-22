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
		// Workaround for compatibility issues.
		// Ideally this section would be empty (and removed).
		// Items should be removed from here when possible.
		{
			label: "Version compatibility workarounds should be used, or removed from syncpack.config.cjs if no longer needed.",
			dependencies: [
				"@fluidframework/build-tools>npm-package-json-lint@^6.0.0",
				"@oclif/core",
			],
			dependencyTypes: ["pnpmOverrides"],
			packages: ["**"],
			range: "~",
		},

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

		// PropertyDDS packages' dependencies are ignored because they use a lot of exact deps.
		{
			dependencies: ["**"],
			packages: ["@fluid-experimental/property-*"],
			isIgnored: true,
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
			label: "Deps in pnpm overrides should use caret dependency ranges",
			dependencyTypes: ["pnpmOverrides"],
			dependencies: ["**"],
			packages: ["**"],
			range: "^",
		},

		{
			label: "Must use exact dependency ranges",
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
				"yargs",
			],
			packages: ["**"],
			range: "",
		},

		// Some dependencies, like typescript and eslint, recommend to use tilde deps because minors introduce
		// changes that may break linting
		{
			label: "Must use tilde dependency ranges",
			dependencies: [
				"eslint-plugin-*",
				"eslint-config-prettier",
				"eslint",
				"less",
				"prettier",
				"typescript",
				"vue",
				"webpack-dev-server",

				// Required due to use of "unstable" tree component APIs
				"@fluentui/react-components",
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
		// Workaround for compatibility issues.
		// Ideally this section would be empty (and removed).
		// Items should be removed from here when possible.
		{
			label: "Version compatibility workarounds should be used, or removed from syncpack.config.cjs if no longer needed.",
			dependencies: ["react-virtualized-auto-sizer", "@types/react", "@types/react-dom"],
			packages: ["**"],
			isIgnored: true,
		},

		{
			label: "Versions of common Fluid packages should all match",
			dependencies: [
				"@fluidframework/build-common",
				"@fluidframework/common-utils",
				"@fluidframework/eslint-config-fluid",
				"@fluidframework/build-tools",
				"@fluid-tools/build-cli",
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
			label: "Ignore interdependencies on other Fluid packages. This is needed because syncpack doesn't understand our >= < semver ranges",
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
