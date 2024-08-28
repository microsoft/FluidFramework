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
	updatePackageJsonFile,
	updatePackageJsonFileAsync,
} from "./common/npmPackage";
export { Timer } from "./common/timer";

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
export {
	type BrokenCompatTypes,
	type ITypeValidationConfig,
} from "./common/typeValidatorConfig";
export {
	TypeOnly,
	MinimalType,
	FullType,
	requireAssignableTo,
} from "./typeValidator/compatibility";
export { type TestCaseTypeData, buildTestCase } from "./typeValidator/testGeneration";
export { type TypeData } from "./typeValidator/typeData";
export { getTypeTestPreviousPackageDetails } from "./typeValidator/validatorUtils";
