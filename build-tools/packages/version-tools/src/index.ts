/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	isInterdependencyRange,
	isRangeOperator,
	isVersionBumpType,
	isVersionBumpTypeExtended,
	isWorkspaceRange,
	DEFAULT_INTERDEPENDENCY_RANGE,
	type InterdependencyRange,
	type RangeOperator,
	RangeOperators,
	type RangeOperatorWithVersion,
	type ReleaseVersion,
	type VersionBumpType,
	type VersionBumpTypeExtended,
	type VersionChangeType,
	type VersionChangeTypeExtended,
	type WorkspaceRange,
	WorkspaceRanges,
} from "./bumpTypes";
export {
	DEFAULT_PRERELEASE_IDENTIFIER,
	changePreReleaseIdentifier,
	getVersionRange,
	fromInternalScheme,
	isInternalTestVersion,
	isInternalVersionRange,
	isInternalVersionScheme,
	toInternalScheme,
} from "./internalVersionScheme";
export {
	bumpVersionScheme,
	detectVersionScheme,
	getLatestReleaseFromList,
	isVersionScheme,
	sortVersions,
	type VersionScheme,
} from "./schemes";
export { bumpRange, detectBumpType, isPrereleaseVersion, getPreviousVersions } from "./semver";
export { getIsLatest, getSimpleVersion, getVersionsFromStrings } from "./versions";
export { fromVirtualPatchScheme, toVirtualPatchScheme } from "./virtualPatchScheme";
