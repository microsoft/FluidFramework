/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This is the main entrypoint to the build-infrastructure API.
 *
 * The primary purpose of this package is to provide a common way to organize npm packages into groups called release
 * groups, and leverages workspaces functionality provided by package managers like npm, yarn, and pnpm to manage
 * interdependencies between packages across a BuildProject. It then provides APIs to select, filter, and work with
 * those package groups.
 *
 * @module default entrypoint
 */

export {
	getAllDependencies,
	loadBuildProject,
} from "./buildProject.js";
export {
	type ReleaseGroupDefinition,
	type WorkspaceDefinition,
	type IFluidBuildDir,
	type IFluidBuildDirs,
	type IFluidBuildDirEntry,
	type BuildProjectConfig as BuildProjectLayout,
	BUILDPROJECT_CONFIG_VERSION,
	getBuildProjectConfig,
} from "./config.js";
export { NotInGitRepository } from "./errors.js";
export {
	getFiles,
	findGitRootSync,
	getMergeBaseRemote,
	getRemote,
	getChangedSinceRef,
} from "./git.js";
export { PackageBase } from "./package.js";
export { updatePackageJsonFile, updatePackageJsonFileAsync } from "./packageJsonUtils.js";
export { createPackageManager } from "./packageManagers.js";
export type {
	AdditionalPackageProps,
	Installable,
	IBuildProject,
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
export { setVersion } from "./versions.js";
