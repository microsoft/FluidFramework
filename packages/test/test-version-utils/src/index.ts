/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export { mochaGlobalSetup } from "./compatConfig.js";
export {
	getDataStoreFactory,
	getVersionedTestObjectProvider,
	getVersionedTestObjectProviderFromApis,
	ITestDataObject,
	TestDataObjectType,
} from "./compatUtils.js";
export { describeInstallVersions } from "./describeWithVersions.js";
export {
	DescribeCompat,
	DescribeCompatSuite,
	describeFullCompat,
	describeLoaderCompat,
	describeNoCompat,
	ITestObjectProviderOptions,
} from "./describeCompat.js";
export {
	describeE2EDocs,
	DocumentType,
	DocumentTypeInfo,
	DescribeE2EDocInfo,
	BenchmarkType,
	describeE2EDocsMemory,
	describeE2EDocsRuntime,
	describeE2EDocRun,
	getCurrentBenchmarkType,
	isMemoryTest,
	DocumentMapInfo,
	DocumentMultipleDataStoresInfo,
	DocumentMatrixInfo,
	DocumentMatrixPlainInfo,
	assertDocumentTypeInfo,
	isDocumentMapInfo,
	isDocumentMultipleDataStoresInfo,
	isDocumentMatrixInfo,
	isDocumentMatrixPlainInfo,
} from "./describeE2eDocs.js";
export { ExpectedEvents, ExpectsTest, itExpects } from "./itExpects.js";
export {
	CompatApis,
	ensurePackageInstalled,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	getLoaderApi,
} from "./testApi.js";
export {
	itExpectsSkipsFailureOnSpecificDrivers,
	itSkipsFailureOnSpecificDrivers,
} from "./itSkipsOnFailure.js";
