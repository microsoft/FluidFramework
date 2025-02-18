/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GitRepo } from "./common/gitRepo";
export { FluidRepo } from "./fluidBuild/fluidRepo";
export { type IFluidBuildConfig } from "./fluidBuild/fluidBuildConfig";
export { getResolvedFluidRoot, getFluidBuildConfig } from "./fluidBuild/fluidUtils";
export type { Logger } from "./common/logging";
export { MonoRepo } from "./common/monoRepo";
export {
	Package,
	type PackageJson,
} from "./common/npmPackage";

// For repo policy check
export {
	normalizeGlobalTaskDefinitions,
	getTaskDefinitions,
	isTaskDependencies,
	WriteableTaskDefinitionsOnDisk,
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
