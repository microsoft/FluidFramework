/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DEFAULT_INTERDEPENDENCY_RANGE,
	InterdependencyRange,
} from "@fluid-tools/version-tools";
import { MonoRepo, Package } from "@fluidframework/build-tools";
import { Args } from "@oclif/core";
// eslint-disable-next-line import/no-deprecated
import { Context, isMonoRepoKind } from "./library/index.js";
import { type ReleaseGroup } from "./releaseGroups.js";

/**
 * Creates a CLI argument for package or release group names. It's a factory function so that commands can override the
 * properties more easily when using the argument.
 */
export const packageOrReleaseGroupArg = Args.custom({
	name: "package_or_release_group",
	required: true,
	description: "The name of a package or a release group.",
});

/**
 * Takes a packageOrReleaseGroupArg and searches the context for it. Release groups are checked first, then independent
 * packages by scoped name, then by unscoped name.
 */
export const findPackageOrReleaseGroup = (
	name: string,
	context: Context,
): Package | MonoRepo | undefined => {
	// eslint-disable-next-line import/no-deprecated
	if (isMonoRepoKind(name)) {
		return context.repo.releaseGroups.get(name);
	}

	return (
		context.fullPackageMap.get(name) ??
		context.independentPackages.find((pkg) => pkg.nameUnscoped === name)
	);
};

// interface IFluidRepoBuildDir extends IRepoBuildDir {}

// export type IFluidRepoBuildDirEntry =
// 	| string
// 	| IFluidRepoBuildDir
// 	| (string | IFluidRepoBuildDir)[];

export const getDefaultInterdependencyRange = (
	releaseGroup: ReleaseGroup | MonoRepo,
	context: Context,
): InterdependencyRange => {
	const releaseGroupName = releaseGroup instanceof MonoRepo ? releaseGroup.name : releaseGroup;
	const interdependencyRangeDefaults =
		context.rootFlubConfig.bump?.defaultInterdependencyRange;
	if (interdependencyRangeDefaults === undefined) {
		return DEFAULT_INTERDEPENDENCY_RANGE;
	}

	const interdependencyRange =
		interdependencyRangeDefaults?.[releaseGroupName as ReleaseGroup];

	return interdependencyRange ?? DEFAULT_INTERDEPENDENCY_RANGE;
};
