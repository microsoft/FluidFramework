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
	// semverGroups: [
	// 	{
	// 		label: "Deps in pnpm overrides are ignored",
	// 		dependencyTypes: ["pnpmOverrides"],
	// 		dependencies: ["**"],
	// 		packages: ["**"],
	// 		isIgnored: true,
	// 	},

	// 	// All deps should use caret ranges unless previously overridden
	// 	{
	// 		label: "Dependencies should use caret dependency ranges",
	// 		dependencies: ["**"],
	// 		dependencyTypes: ["dev", "peer", "prod"],
	// 		packages: ["**"],
	// 		range: "^",
	// 		isIgnored: true,
	// 	},

	// ],

	semverGroups: [
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
