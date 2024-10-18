/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
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
export {
	filterPackages,
	type FilterablePackage,
	selectAndFilterPackages,
	type GlobString,
	AllPackagesSelectionCriteria,
	EmptySelectionCriteria,
	type PackageSelectionCriteria,
	type PackageFilterOptions,
} from "./filter.js";
export {
	FluidRepo as FluidRepoBase,
	getAllDependenciesInRepo,
	loadFluidRepo,
} from "./fluidRepo.js";
export {
	getFiles,
	findGitRootSync,
	getMergeBaseRemote,
	getRemote,
	getChangedSinceRef,
} from "./git.js";
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
	FluidPackageJsonFields,
	PackageDependency,
	IPackageManager,
} from "./types.js";
export { isIPackage, isIReleaseGroup } from "./types.js";
export { PackageBase } from "./package.js";
export { updatePackageJsonFile, updatePackageJsonFileAsync } from "./packageJsonUtils.js";
export { createPackageManager } from "./packageManagers.js";
export { setVersion } from "./versions.js";
