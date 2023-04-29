/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	isInterdependencyRange,
	isVersionBumpType,
	isVersionBumpTypeExtended,
	InterdependencyRange,
	InterdependencyRangeOperator,
	InterdependencyRangeOperators,
	ReleaseVersion,
	VersionBumpType,
	VersionBumpTypeExtended,
	VersionChangeType,
	VersionChangeTypeExtended,
	WorkspaceInterdependencyRange,
	WorkspaceInterdependencyRanges,
} from "./bumpTypes";
export {
	changePreReleaseIdentifier,
	getVersionRange,
	fromInternalScheme,
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
export { fromVirtualPatchScheme, toVirtualPatchScheme } from "./virtualPatchScheme";
