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
			label:
				"Version compatibility workarounds should be used, or removed from syncpack.config.cjs if no longer needed.",
			dependencies: ["@oclif/core"],
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
			label: "Deps in pnpm overrides can use whatever dependency ranges they need",
			dependencyTypes: ["pnpmOverrides"],
			dependencies: ["**"],
			packages: ["**"],
			isIgnored: true,
		},

		{
			label: "Must use exact dependency ranges",
			dependencies: [
				"@tiny-calc/*",
				"@graphql-codegen/cli",
				"@graphql-codegen/typescript",
				"@material-ui/*",
				// api-extractor is patched, so it must use an exact version to avoid the patch breaking when updating.
				"@microsoft/api-extractor",
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
				"@biomejs/biome",
				"eslint-plugin-*",
				"eslint-config-prettier",
				"eslint",
				"less",
				"prettier",
				"typescript",
				"vue",
				"webpack-dev-server",

				// pinned since newer versions (2.3 through 2.6) refuse to work on NodeJS other than 10 || 12 || 14 due to https://github.com/cerner/terra-toolkit/issues/828
				"@cerner/duplicate-package-checker-webpack-plugin",

				// socket.io-client is forced to avoid 4.8 to avoid https://github.com/socketio/socket.io/issues/5202
				"socket.io-client",
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
			label:
				"Version compatibility workarounds should be used, or removed from syncpack.config.cjs if no longer needed.",
			dependencies: ["react-virtualized-auto-sizer", "@types/react", "@types/react-dom"],
			packages: ["**"],
			isIgnored: true,
		},
		// Workaround for this private internal package. Can be removed once our types wrapper around
		// the package is no longer needed - see https://github.com/argos-ci/jest-puppeteer/issues/568.
		{
			label: "Ignore private workaround package @types/jest-environment-puppeteer",
			dependencies: ["@types/jest-environment-puppeteer"],
			dependencyTypes: ["dev", "prod"],
			packages: ["**"],
			isIgnored: true,
		},

		{
			label: "Versions of common Fluid packages should all match",
			dependencies: [
				"@fluid-internal/eslint-plugin-fluid",
				"@fluid-tools/benchmark",
				"@fluid-tools/build-cli",
				"@fluidframework/build-common",
				"@fluidframework/build-tools",
				"@fluidframework/common-utils",
				"@fluidframework/eslint-config-fluid",
				"@fluidframework/protocol-definitions",
				"@fluidframework/test-tools",
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
