/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

/**
 * @type {import("@fluidframework/build-tools").IFluidBuildConfig}
 */
const config = {
	version: 1,
	repoPackages: {
		// "build-tools" release group: the root workspace, which lists packages/pkg-a via pnpm-workspace.yaml.
		// Uses "build-tools" (a known ReleaseGroup) so that getFluidDependencies can identify it.
		"build-tools": ".",
		// "group2" release group: a sub-workspace containing pkg-b
		group2: "group2",
		// independent package: pkg-c (no release group)
		"pkg-c": "pkg-c",
	},
};

module.exports = config;
