/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GitRepo } from "./common/gitRepo.js";
export { FluidRepo } from "./fluidBuild/fluidRepo.js";
export { type IFluidBuildConfig } from "./fluidBuild/fluidBuildConfig.js";
export { type IFluidCompatibilityMetadata } from "./fluidBuild/fluidCompatMetadata.js";
export { getResolvedFluidRoot, getFluidBuildConfig } from "./fluidBuild/fluidUtils.js";
export type { Logger } from "./common/logging.js";
export { MonoRepo } from "./common/monoRepo.js";
export {
	Package,
	type PackageJson,
} from "./common/npmPackage.js";

// For repo policy check
export {
	normalizeGlobalTaskDefinitions,
	getTaskDefinitions,
} from "./fluidBuild/fluidTaskDefinitions.js";
export {
	getApiExtractorConfigFilePath,
	getEsLintConfigFilePath,
} from "./fluidBuild/tasks/taskUtils.js";
export * as TscUtils from "./fluidBuild/tscUtils.js";
export { getTypeTestPreviousPackageDetails } from "./common/typeTests.js";

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
} from "./common/typeCompatibility.js";
