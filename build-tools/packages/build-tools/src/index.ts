/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GitRepo } from "./common/gitRepo";
export { FluidRepo, type IFluidBuildConfig } from "./common/fluidRepo";
export { getResolvedFluidRoot, getFluidBuildConfig } from "./common/fluidUtils";
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
} from "./common/fluidTaskDefinitions";
export { getApiExtractorConfigFilePath, getEsLintConfigFilePath } from "./common/taskUtils";
export * as TscUtils from "./common/tscUtils";

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
