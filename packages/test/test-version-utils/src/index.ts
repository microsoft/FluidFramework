/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { mochaGlobalSetup } from "./compatConfig.js";
export { CompatKind } from "./compatOptions.js";
export {
	ITestDataObject,
	TestDataObjectType,
	getDataStoreFactory,
	getVersionedTestObjectProvider,
	getVersionedTestObjectProviderFromApis,
} from "./compatUtils.js";
export {
	type CompatType,
	DescribeCompat,
	DescribeCompatSuite,
	ITestObjectProviderOptions,
	describeCompat,
} from "./describeCompat.js";
export {
	BenchmarkType,
	DescribeE2EDocInfo,
	DescribeE2EDocSuite,
	DocumentMapInfo,
	DocumentMatrixInfo,
	DocumentMatrixPlainInfo,
	DocumentMultipleDataStoresInfo,
	DocumentType,
	DocumentTypeInfo,
	assertDocumentTypeInfo,
	describeE2EDocRun,
	describeE2EDocs,
	describeE2EDocsMemory,
	describeE2EDocsRuntime,
	getCurrentBenchmarkType,
	isDocumentMapInfo,
	isDocumentMatrixInfo,
	isDocumentMatrixPlainInfo,
	isDocumentMultipleDataStoresInfo,
	isMemoryTest,
} from "./describeE2eDocs.js";
export {
	DescribeSuiteWithVersions,
	DescribeWithVersions,
	IRequestedFluidVersions,
	describeInstallVersions,
} from "./describeWithVersions.js";
export { ExpectedEvents, ExpectsTest, itExpects } from "./itExpects.js";
export {
	SkippedErrorExpectingTestWithDriverBaseType,
	SkippedErrorExpectingTestWithDriverType,
	SkippedTestWithDriverBaseType,
	SkippedTestWithDriverType,
	itExpectsSkipsFailureOnSpecificDrivers,
	itSkipsFailureOnSpecificDrivers,
} from "./itSkipsOnFailure.js";
export {
	CompatApis,
	CompatMode,
	ContainerRuntimeApi,
	DataRuntimeApi,
	InstalledPackage,
	LoaderApi,
	ensurePackageInstalled,
	getCompatModeFromKind,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	getLoaderApi,
} from "./testApi.js";
export { getRequestedVersion, versionToComparisonNumber } from "./versionUtils.js";
