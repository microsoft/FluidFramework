/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

/**
 * @type {import("@fluid-tools/build-infrastructure").IFluidRepoLayout & import("@fluid-tools/build-cli").FlubConfig}
 */
const config = {
	version: 1,
	repoLayout: {
		workspaces: {
			main: {
				directory: ".",
				releaseGroups: {
					main: {
						include: ["pkg-a", "pkg-b", "@shared", "@private"],
						rootPackageName: "main-release-group-root",
					},
					group2: {
						include: ["@group2"],
					},
					group3: {
						include: ["@group3"],
					},
				},
			},
			second: {
				directory: "./second",
				releaseGroups: {
					"second-release-group": {
						include: ["*"],
						rootPackageName: "second-release-group-root",
					},
				},
			},
		},
	},
};

module.exports = config;
