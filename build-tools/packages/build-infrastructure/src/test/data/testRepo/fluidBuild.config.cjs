/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

/**
 * @type {import("@fluid-tools/build-infrastructure").IBuildProjectLayout & import("@fluid-tools/build-cli").FlubConfig}
 */
const config = {
	version: 1,
	buildProject: {
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

	// The configuration used by the `flub generate changeset-config` command.
	changesetConfig: {
		changelog: [
			"@fluid-private/changelog-generator-wrapper",
			{
				repoBaseUrl: "https://github.com/microsoft/FluidFramework",
				issueTemplate: " ([#$issue]($repoBaseUrl/pull/$issue))",
				commitTemplate: " [$abbrevHash]($repoBaseUrl/commit/$hash)",
			},
		],
		commit: false,
		access: "public",
		baseBranch: "main",
		updateInternalDependencies: "patch",
	},
};

module.exports = config;
