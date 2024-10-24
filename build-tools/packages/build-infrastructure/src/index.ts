/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This is the main entrypoint to the build-infrastructure API.
 *
 * The primary purpose of this package is to provide a common way to organize npm packages into groups called release
 * groups, and leverages workspaces functionality provided by package managers like npm, yarn, and pnpm to manage
 * interdependencies between packages across a Fluid repo. It then provides APIs to select, filter, and work with those
 * package groups.
 *
 * @module default entrypoint
 */

export {
	type ReleaseGroupDefinition,
	type WorkspaceDefinition,
	type IFluidBuildDir,
	type IFluidBuildDirs,
	type IFluidBuildDirEntry,
	type IFluidRepoLayout,
	FLUIDREPO_CONFIG_VERSION,
	getFluidRepoLayout,
} from "./config.js";
export { NotInGitRepository } from "./errors.js";
export type {
	AdditionalPackageProps,
	Installable,
	IFluidRepo,
	IPackage,
	IReleaseGroup,
	IWorkspace,
	PackageJson,
	PackageManagerName,
	PackageName,
	ReleaseGroupName,
	Reloadable,
	WorkspaceName,
	PnpmPackageJsonFields as FluidPackageJsonFields,
	PackageDependency,
	IPackageManager,
} from "./types.js";
export { isIPackage, isIReleaseGroup } from "./types.js";

// export {
// 	filterPackages,
// 	type FilterablePackage,
// 	selectAndFilterPackages,
// 	type GlobString,
// 	AllPackagesSelectionCriteria,
// 	EmptySelectionCriteria,
// 	type PackageSelectionCriteria,
// 	type PackageFilterOptions,
// } from "./filter.js";
// export {
// 	FluidRepo as FluidRepoBase,
// 	getAllDependenciesInRepo,
// 	loadFluidRepo,
// } from "./fluidRepo.js";
// export {
// 	getFiles,
// 	findGitRootSync,
// 	getMergeBaseRemote,
// 	getRemote,
// 	getChangedSinceRef,
// } from "./git.js";
// export { PackageBase } from "./package.js";
// export { updatePackageJsonFile, updatePackageJsonFileAsync } from "./packageJsonUtils.js";
// export { createPackageManager } from "./packageManagers.js";
// export { setVersion } from "./versions.js";
