/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	indent: "\t",
	workspace: false,
	semverGroups: [
		// Rules are applied in order to package/dep combinations. First matching rule applies. When running `syncpack
		// lint-semver-ranges`, the output is grouped into numbered groups. However, the numbers of the groups are the
		// _inverse_ of their order in this array. That is, Semver Group 1 in the output will correspond to the _last_
		// rule in this array.
		{
			dependencies: ["**"],
			// dependencyTypes: ["devDependencies"],
			packages: [
				// PropertyDDS is ignored
				"@fluid-experimental/property-*",
				// Ignore all experimental packages
				// "@fluid-experimental/*",
			],
			isIgnored: true,
		},
		{
			// These dependencies should always be on exact versions
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
		{
			// Some dependencies, like typescript and eslint, recommend to use tilde deps because minors introduce
			// changes that may break linting
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
		{
			// All deps should use caret ranges unless previously overridden
			dependencies: ["**"],
			packages: ["**"],
			range: "^",
		},
	],
	versionGroups: [
		// {
		//     // PropertyDDS
		//     "dependencies": ["**"],
		//     "packages": ["@fluid-experimental/property-"],
		// },
		// {
		//     // If unmatched, ignore
		//     packages: ['**'],
		//     dependencies: ['**'],
		//     isIgnored: true,
		// }
		{
			// Some dependencies, like typescript and eslint, recommend to use tilde deps because minors introduce
			// changes that may break linting
			dependencies: [
				"eslint-plugin-*",

				"eslint-config-prettier",
				"eslint",
				"prettier",
				"typescript",
				"vue",
				"webpack-dev-server",
			],
			packages: ["**"],
			range: "~",
		},
	],
};
