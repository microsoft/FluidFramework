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
	BUILDPROJECT_CONFIG_VERSION,
	type BuildProjectConfig as BuildProjectLayout,
	getBuildProjectConfig,
	type IFluidBuildDir,
	type IFluidBuildDirEntry,
	type IFluidBuildDirs,
	type ReleaseGroupDefinition,
	type WorkspaceDefinition,
} from "./config.js";
export { NotInGitRepository } from "./errors.js";
export {
	findGitRootSync,
	getChangedSinceRef,
	getFiles,
	getMergeBaseRemote,
	getRemote,
} from "./git.js";
export { PackageBase } from "./package.js";
export { updatePackageJsonFile, updatePackageJsonFileAsync } from "./packageJsonUtils.js";
export { createPackageManager } from "./packageManagers.js";
export type {
	AdditionalPackageProps,
	IBuildProject,
	Installable,
	IPackage,
	IPackageManager,
	IReleaseGroup,
	IWorkspace,
	PackageDependency,
	PackageJson,
	PackageManagerName,
	PackageName,
	PnpmPackageJsonFields as FluidPackageJsonFields,
	ReleaseGroupName,
	Reloadable,
	WorkspaceName,
} from "./types.js";
export { isIPackage, isIReleaseGroup } from "./types.js";
export { setVersion } from "./versions.js";
