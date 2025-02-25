/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";

/**
 * The default interdependency range we use when one is not provided.
 */
export const DEFAULT_INTERDEPENDENCY_RANGE: InterdependencyRange = "^";

/**
 * A type alias for strings that represent package versions.
 */
export type ReleaseVersion = string;

/**
 * An array of the semver range operators we use. The empty string (`""`) is used to indicate exact dependencies.
 *
 * @remarks
 * We intentionally only include the operators we use, not everything considered valid in the semver spec.
 */
export const RangeOperators = ["^", "~", ""] as const;

/**
 * A type representing the semver range operators we use.
 *
 * @remarks
 * We intentionally only include the operators we use, not everything considered valid in the semver spec.
 */
export type RangeOperator = (typeof RangeOperators)[number];

/**
 * A typeguard to check if a variable is a {@link RangeOperator}.
 */
export function isRangeOperator(r: unknown): r is RangeOperator {
	return RangeOperators.includes(r as RangeOperator);
}

/**
 * A type representing a version string prefixed with a {@link RangeOperator}.
 */
export type RangeOperatorWithVersion = `${Exclude<RangeOperator, "">}${string}`;

/**
 * An array of the workspace range strings we use.
 *
 * @remarks
 * We intentionally only include the ranges we use, not everything considered valid by workspace-protocol-aware tools
 * like yarn and pnpm.
 */
export const WorkspaceRanges = ["workspace:*", "workspace:^", "workspace:~"] as const;

/**
 * A type representing the workspace range strings we use.
 *
 * @remarks
 * We intentionally only include the ranges we use, not everything considered valid by workspace-protocol-aware tools
 * like yarn and pnpm.
 */
export type WorkspaceRange = (typeof WorkspaceRanges)[number];

/**
 * A typeguard to check if a variable is a {@link WorkspaceRange}.
 */
export function isWorkspaceRange(r: unknown): r is WorkspaceRange {
	return WorkspaceRanges.includes(r as WorkspaceRange);
}

/**
 * A type representing the strings we consider valid for interdependencies - dependencies between packages within the
 * same release group.
 */
export type InterdependencyRange =
	| WorkspaceRange
	| RangeOperator
	| RangeOperatorWithVersion
	| semver.SemVer;

/**
 * A typeguard to check if a variable is a {@link InterdependencyRange}.
 *
 * @remarks
 * As implemented, this function might better be inverted and named "isNOTInterdependencyRange". It does a better job of
 * excluding non-conforming strings than it does at finding valid ones. This appears to be sufficient for our needs,
 * which is good because I don't know how to fix it.
 */
export function isInterdependencyRange(r: unknown): r is InterdependencyRange {
	if ((typeof r === "string" || r instanceof semver.SemVer) && semver.valid(r) !== null) {
		return true;
	}

	if (isRangeOperator(r) || isWorkspaceRange(r)) {
		return true;
	}

	if ((typeof r === "string" || r instanceof semver.Range) && semver.validRange(r) === null) {
		return false;
	}

	if (typeof r === "string") {
		return isRangeOperator(r[0]);
	}

	return false;
}

/**
 * A type defining the three basic version bump types:
 *
 * - major
 *
 * - minor
 *
 * - patch
 */
export type VersionBumpType = "major" | "minor" | "patch";

/**
 * A type defining the three basic version bump types plus an additional value "current", which is used to indicate a
 * no-op version bump.
 */
export type VersionBumpTypeExtended = VersionBumpType | "current";

/**
 * A union type representing either a {@link VersionBumpType} or a specified version.
 */
export type VersionChangeType = VersionBumpType | semver.SemVer;

/**
 * A union type representing either a {@link VersionBumpTypeExtended} or a specified version.
 */
export type VersionChangeTypeExtended = VersionBumpTypeExtended | semver.SemVer;

/**
 * A typeguard to check if a version is a {@link VersionBumpType}.
 */
export function isVersionBumpType(
	type: VersionChangeType | string | undefined,
): type is VersionBumpType {
	return type === undefined ? false : type === "major" || type === "minor" || type === "patch";
}

/**
 * A typeguard to check if a version is a {@link VersionBumpTypeExtended}.
 */
export function isVersionBumpTypeExtended(
	type: VersionChangeType | string,
): type is VersionBumpTypeExtended {
	return type === "major" || type === "minor" || type === "patch" || type === "current";
}
