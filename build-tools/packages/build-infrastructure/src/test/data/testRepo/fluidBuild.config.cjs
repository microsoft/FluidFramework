/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

/**
 * @type {import("@fluid-tools/build-infrastructure").IFluidRepoLayout}
 */
const config = {
	version: 1,
	repoLayout: {
		workspaces: {
			main: {
				directory: ".",
				releaseGroups: {
					main: {
						include: ["*"],
						rootPackageName: "main-release-group-root",
					},
					// examples: {
					// 	include: ["@fluid-example"],
					// },
				},
			},
			second: {
				directory: "./second",
				releaseGroups: {
					"second-release-group": {
						include: ["*"],
						rootPackageName: "second-release-group-root",
						// defaultInterdependencyRange: "workspace:~",
					},
				},
			},
		},
	},
};

module.exports = config;
