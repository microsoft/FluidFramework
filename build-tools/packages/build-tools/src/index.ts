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
 * The types defined here are in a .cts file so they can be imported from both ESM and CJS contexts.
 * This is necessary because these types are used by generated type test files which may be compiled
 * as either ESM or CJS depending on the package's configuration.
 */
export type {
	TypeOnly,
	MinimalType,
	FullType,
	requireAssignableTo,
	SkipUniqueSymbols,
} from "./common/typeCompatibility.cjs";
