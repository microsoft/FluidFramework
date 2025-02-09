/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GitRepo } from "./common/gitRepo";
export { getFluidBuildConfig } from "./fluidBuild/config";
export type { IFluidBuildConfig } from "./fluidBuild/fluidBuildConfig";
export {
	/**
	 * @deprecated Replace usage as soon as possible.
	 */
	FluidRepoBuild as FluidRepo,
} from "./fluidBuild/fluidRepoBuild";
export type { Logger } from "./common/logging";
export {
	/**
	 * @deprecated Replace usage as soon as possible.
	 */
	BuildPackage as Package,
	MonoRepo,
	/**
	 * @deprecated Replace usage as soon as possible.
	 */
	type FluidBuildPackageJson as PackageJson,
	updatePackageJsonFileAsync,
	updatePackageJsonFile,
} from "./common/npmPackage";

// For repo policy check
export {
	normalizeGlobalTaskDefinitions,
	getTaskDefinitions,
} from "./fluidBuild/fluidTaskDefinitions";
export {
	getApiExtractorConfigFilePath,
	getEsLintConfigFilePath,
} from "./fluidBuild/tasks/taskUtils";
export * as TscUtils from "./fluidBuild/tscUtils";
export { getTypeTestPreviousPackageDetails } from "./common/typeTests";

/**
 * The types defined here cannot be in build-cli because it is an ESM-only package, and these types are imported in
 * packages that are dual-emit or CJS-only. Long term these types should move to a shared library between build-cli and
 * build-tools.
 */
export type {
	TypeOnly,
	MinimalType,
	FullType,
	requireAssignableTo,
	SkipUniqueSymbols,
} from "./common/typeCompatibility";

// re-export some stuff temporarily from build-infrastructure
export {
	type IPackage,
	type ReleaseGroupName,
	type PackageName,
	/**
	 * @deprecated Replace as soon as possible with IReleaseGroup directly.
	 */
	// type IReleaseGroup as MonoRepo,
} from "@fluid-tools/build-infrastructure";
