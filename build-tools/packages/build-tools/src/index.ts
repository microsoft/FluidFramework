/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GitRepo } from "./common/gitRepo";
export {
	type ITypeValidationConfig,
	FluidRepo,
	type BrokenCompatTypes,
} from "./common/fluidRepo";
export { getResolvedFluidRoot, loadFluidBuildConfig } from "./common/fluidUtils";
export type { Logger } from "./common/logging";
export { MonoRepo } from "./common/monoRepo";
export {
	Package,
	type PackageJson,
	updatePackageJsonFile,
	updatePackageJsonFileAsync,
} from "./common/npmPackage";
export { Timer } from "./common/timer";
export type {
	IFluidBuildConfig,
	PackageNamePolicyConfig,
	PolicyConfig,
	PreviousVersionStyle,
	ScriptRequirement,
} from "./common/fluidRepo";

// For repo policy check
export {
	normalizeGlobalTaskDefinitions,
	getTaskDefinitions,
} from "./common/fluidTaskDefinitions";
export { getEsLintConfigFilePath } from "./common/taskUtils";
export * as TscUtils from "./common/tscUtils";

export { TypeOnly, MinimalType, FullType } from "./typeValidator/compatibility";
export { type TestCaseTypeData, buildTestCase } from "./typeValidator/testGeneration";
export { type TypeData, getFullTypeName } from "./typeValidator/typeData";
export { getTypeTestPreviousPackageDetails } from "./typeValidator/validatorUtils";
