/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GitRepo } from "./common/gitRepo";
export type { Logger } from "./common/logging";
export { MonoRepo } from "./common/monoRepo";
export {
	Package,
	type PackageJson,
} from "./common/npmPackage";
/**
 * The types defined here cannot be in build-cli because it is an ESM-only package, and these types are imported in
 * packages that are dual-emit or CJS-only. Long term these types should move to a shared library between build-cli and
 * build-tools.
 */
export type {
	FullType,
	MinimalType,
	requireAssignableTo,
	SkipUniqueSymbols,
	TypeOnly,
} from "./common/typeCompatibility";
export { getTypeTestPreviousPackageDetails } from "./common/typeTests";
export { type IFluidBuildConfig } from "./fluidBuild/fluidBuildConfig";
export { type IFluidCompatibilityMetadata } from "./fluidBuild/fluidCompatMetadata";
export { FluidRepo } from "./fluidBuild/fluidRepo";
// For repo policy check
export {
	getTaskDefinitions,
	normalizeGlobalTaskDefinitions,
} from "./fluidBuild/fluidTaskDefinitions";
export { getFluidBuildConfig, getResolvedFluidRoot } from "./fluidBuild/fluidUtils";
export {
	getApiExtractorConfigFilePath,
	getEsLintConfigFilePath,
} from "./fluidBuild/tasks/taskUtils";
export * as TscUtils from "./fluidBuild/tscUtils";
