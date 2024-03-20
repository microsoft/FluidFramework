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
	InterdependencyRange,
	RangeOperator,
	RangeOperators,
	RangeOperatorWithVersion,
	ReleaseVersion,
	VersionBumpType,
	VersionBumpTypeExtended,
	VersionChangeType,
	VersionChangeTypeExtended,
	WorkspaceRange,
	WorkspaceRanges,
} from "./bumpTypes";
export {
	ALLOWED_PRERELEASE_IDENTIFIERS,
	DEFAULT_PRERELEASE_IDENTIFIER,
	RC_PRERELEASE_IDENTIFER,
	changePreReleaseIdentifier,
	getVersionRange,
	fromInternalScheme,
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
	VersionScheme,
} from "./schemes";
export { bumpRange, detectBumpType, isPrereleaseVersion, getPreviousVersions } from "./semver";
export { getIsLatest, getSimpleVersion } from "./versions";
export { fromVirtualPatchScheme, toVirtualPatchScheme } from "./virtualPatchScheme";
