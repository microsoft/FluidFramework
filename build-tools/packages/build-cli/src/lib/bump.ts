/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, MonoRepo, Logger, Package, VersionBag } from "@fluidframework/build-tools";
import {
	DEFAULT_INTERDEPENDENCY_RANGE,
	InterdependencyRange,
	VersionChangeType,
	VersionScheme,
	bumpRange,
	bumpVersionScheme,
	isVersionBumpType,
	isVersionBumpTypeExtended,
} from "@fluid-tools/version-tools";
import * as semver from "semver";

import { setVersion } from "./package";

/**
 * A type representing the types of dependency updates that can be done. This type is intended to match the type
 * npm-check-updates uses for its `target` argument.
 */
export type DependencyUpdateType =
	| "latest"
	| "newest"
	| "greatest"
	| "minor"
	| "patch"
	| `@${string}`;

/**
 * A type guard used to determine if a string is a DependencyUpdateType.
 *
 * @internal
 */
export function isDependencyUpdateType(str: string | undefined): str is DependencyUpdateType {
	if (str === undefined) {
		return false;
	}

	if (["latest", "newest", "greatest", "minor", "patch"].includes(str)) {
		return true;
	}

	return str.startsWith("@");
}

/**
 * Bumps a release group or standalone package by the bumpType.
 *
 * @param context - The {@link Context}.
 * @param releaseGroupOrPackage - A release group repo or package to bump.
 * @param bumpType - The bump type. Can be a SemVer object to set an exact version.
 * @param scheme - The version scheme to use.
 * @param interdependencyRange - The type of dependency to use on packages within the release group.
 * @param log - A logger to use.
 *
 * @internal
 */
// eslint-disable-next-line max-params
export async function bumpReleaseGroup(
	context: Context,
	releaseGroupOrPackage: MonoRepo | Package,
	bumpType: VersionChangeType,
	scheme?: VersionScheme,
	// eslint-disable-next-line default-param-last
	interdependencyRange: InterdependencyRange = DEFAULT_INTERDEPENDENCY_RANGE,
	log?: Logger,
): Promise<void> {
	const translatedVersion = isVersionBumpType(bumpType)
		? bumpVersionScheme(releaseGroupOrPackage.version, bumpType, scheme)
		: bumpType;

	await setVersion(context, releaseGroupOrPackage, translatedVersion, interdependencyRange, log);
}
