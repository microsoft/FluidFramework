/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

// const rootSettings = require("../syncpack.config.cjs");

/** @type {import("syncpack").RcFile} */
const config = {
	indent: "\t",
	semverRange: "^",
	semverGroups: [
		{
			label: "Deps in pnpm overrides are ignored",
			dependencyTypes: ["pnpmOverrides"],
			dependencies: ["**"],
			packages: ["**"],
			isIgnored: true,
		},
		{
			label: "ignore typescript",
			dependencyTypes: ["dev"],
			dependencies: ["typescript"],
			packages: ["**"],
			isIgnored: true,
		},
		{
			range: "",
			dependencyTypes: ["prod", "resolutions", "overrides", "pnpmOverrides", "workspace"],
			dependencies: ["**"],
			packages: ["**"],
		},
		{
			range: "~",
			dependencyTypes: ["dev"],
			dependencies: ["**"],
			packages: ["**"],
		},
		{
			range: "^",
			dependencyTypes: ["peer"],
			dependencies: ["**"],
			packages: ["**"],
		},
	],
};

exports.default = config;
