/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { run } from "@oclif/core";
export {
	knownReleaseGroups,
	type ReleaseGroup,
	type ReleasePackage,
	isReleaseGroup,
	type ReleaseSource,
} from "./releaseGroups";
export { BaseCommand, Args, Flags } from "./base";
export {
	Context,
	type DependencyUpdateType,
	difference,
	generateBumpDepsBranchName,
	generateBumpDepsCommitMessage,
	generateBumpVersionBranchName,
	generateBumpVersionCommitMessage,
	generateReleaseBranchName,
	getDefaultBumpTypeForBranch,
	getPreReleaseDependencies,
	getReleaseSourceForReleaseGroup,
	indentString,
	isMonoRepoKind,
	isReleased,
	MonoRepoKind,
	npmCheckUpdates,
	setVersion,
	type VersionDetails,
	type PackageVersionMap,
	type PreReleaseDependencies,
} from "./library";
export type { CommandLogger } from "./logging";
export { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "./args";
export {
	bumpTypeFlag,
	bumpTypeExtendedFlag,
	checkFlags,
	packageSelectorFlag,
	releaseGroupFlag,
	skipCheckFlag,
	testModeFlag,
} from "./flags";
