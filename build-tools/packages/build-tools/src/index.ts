/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GitRepo } from "./common/gitRepo.js";
export type { Logger } from "./common/logging.js";
export { MonoRepo } from "./common/monoRepo.js";
export {
	Package,
	type PackageJson,
} from "./common/npmPackage.js";
/**
 * Long term these types should move to build-cli as there is no use in build-tools.
 */
export type {
	FullType,
	MinimalType,
	requireAssignableTo,
	SkipUniqueSymbols,
	TypeOnly,
} from "./common/typeCompatibility.js";
export { getTypeTestPreviousPackageDetails } from "./common/typeTests.js";
export type { IFluidBuildConfig } from "./fluidBuild/fluidBuildConfig.js";
export type { IFluidCompatibilityMetadata } from "./fluidBuild/fluidCompatMetadata.js";
export { FluidRepo } from "./fluidBuild/fluidRepo.js";
// For repo policy check
export {
	getTaskDefinitions,
	normalizeGlobalTaskDefinitions,
} from "./fluidBuild/fluidTaskDefinitions.js";
export { getFluidBuildConfig, getResolvedFluidRoot } from "./fluidBuild/fluidUtils.js";
export {
	getApiExtractorConfigFilePath,
	getEsLintConfigFilePath,
} from "./fluidBuild/tasks/taskUtils.js";
export * as TscUtils from "./fluidBuild/tscUtils.js";
