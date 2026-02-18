/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	DEFAULT_INTERDEPENDENCY_RANGE,
	type InterdependencyRange,
	isInterdependencyRange,
	isRangeOperator,
	isVersionBumpType,
	isVersionBumpTypeExtended,
	isWorkspaceRange,
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
	changePreReleaseIdentifier,
	DEFAULT_PRERELEASE_IDENTIFIER,
	fromInternalScheme,
	getVersionRange,
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
export { bumpRange, detectBumpType, getPreviousVersions, isPrereleaseVersion } from "./semver";
export { getIsLatest, getSimpleVersion, getVersionsFromStrings } from "./versions";
export { fromVirtualPatchScheme, toVirtualPatchScheme } from "./virtualPatchScheme";
