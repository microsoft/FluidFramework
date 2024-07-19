/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DEFAULT_INTERDEPENDENCY_RANGE,
	InterdependencyRange,
} from "@fluid-tools/version-tools";
import { IRepoBuildDir, MonoRepo, Package } from "@fluidframework/build-tools";
import { Args } from "@oclif/core";
// eslint-disable-next-line import/no-deprecated
import { Context, isMonoRepoKind } from "./library/index.js";

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

interface IFluidRepoBuildDir extends IRepoBuildDir {
	/**
	 * The interdependencyRange controls the type of semver range to use between packages in the same release group. This
	 * setting controls the default range that will be used when updating the version of a release group. The default can
	 * be overridden using the `--interdependencyRange` flag in the `flub bump` command.
	 */
	defaultInterdependencyRange?: InterdependencyRange;
}

export type IFluidRepoBuildDirEntry =
	| string
	| IFluidRepoBuildDir
	| (string | IFluidRepoBuildDir)[];

export const getDefaultInterdependencyRange = (
	releaseGroup: MonoRepo,
	context: Context,
): InterdependencyRange => {
	const packageManifest = context.rootFluidBuildConfig;
	const repoPackages = packageManifest.repoPackages as Record<string, IFluidRepoBuildDirEntry>;
	for (const [group, item] of Object.entries(repoPackages)) {
		if (group === releaseGroup.name) {
			if (Array.isArray(item)) {
				throw new TypeError(
					`ReleaseGroup ${releaseGroup.name} cannot have array entries in package manifest`,
				);
			}
			const interdependencyRange =
				typeof item === "object" ? item.defaultInterdependencyRange : undefined;
			return interdependencyRange ?? DEFAULT_INTERDEPENDENCY_RANGE;
		}
	}
	throw new Error(`ReleaseGroup ${releaseGroup.name} not found in package manifest`);
};
