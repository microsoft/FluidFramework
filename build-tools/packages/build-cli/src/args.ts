/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MonoRepo, Package } from "@fluidframework/build-tools";
import { Args } from "@oclif/core";
import { PackageName } from "@rushstack/node-core-library";
import * as semver from "semver";
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
		context.independentPackages.find((pkg) => PackageName.getUnscopedName(pkg.name) === name)
	);
};

/**
 * Creates a CLI argument for release group names. It's a factory function so that commands can override the
 * properties more easily when using the argument.
 */
export const releaseGroupArg = Args.custom({
	name: "release_group",
	required: true,
	description: "The name of a release group.",
});

/**
 * Creates a CLI argument for semver versions. It's a factory function so that commands can override the properties more
 * easily when using the argument.
 */
export const semverArg = Args.custom<semver.SemVer, { loose?: boolean }>({
	required: true,
	description:
		"A semantic versioning (semver) version string. Values are verified to be valid semvers during argument parsing.",
	parse: async (input, _, opts) => {
		const parsed = semver.parse(input, opts.loose);
		if (parsed === null) {
			throw new Error(`Invalid semver: ${input}`);
		}
		return parsed;
	},
});
