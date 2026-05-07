/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { mochaGlobalSetup } from "./compatConfig.js";
export { CompatKind } from "./compatOptions.js";
export {
	getDataStoreFactory,
	getVersionedTestObjectProvider,
	getVersionedTestObjectProviderFromApis,
	ITestDataObject,
	TestDataObjectType,
} from "./compatUtils.js";
export {
	type CompatType,
	DescribeCompat,
	DescribeCompatSuite,
	describeCompat,
	ITestObjectProviderOptions,
} from "./describeCompat.js";
export {
	assertDocumentTypeInfo,
	DescribeE2EDocInfo,
	DescribeE2EDocSuite,
	DocumentMapInfo,
	DocumentMatrixInfo,
	DocumentMatrixPlainInfo,
	DocumentMultipleDataStoresInfo,
	DocumentType,
	DocumentTypeInfo,
	describeE2EDocs,
	isDocumentMapInfo,
	isDocumentMatrixInfo,
	isDocumentMatrixPlainInfo,
	isDocumentMultipleDataStoresInfo,
} from "./describeE2eDocs.js";
export {
	DescribeSuiteWithVersions,
	DescribeWithVersions,
	describeInstallVersions,
	IRequestedFluidVersions,
} from "./describeWithVersions.js";
export { ExpectedEvents, ExpectsTest, itExpects } from "./itExpects.js";
export {
	itExpectsSkipsFailureOnSpecificDrivers,
	itSkipsFailureOnSpecificDrivers,
	SkippedErrorExpectingTestWithDriverBaseType,
	SkippedErrorExpectingTestWithDriverType,
	SkippedTestWithDriverBaseType,
	SkippedTestWithDriverType,
} from "./itSkipsOnFailure.js";
export {
	CompatApis,
	CompatMode,
	ContainerRuntimeApi,
	DataRuntimeApi,
	ensureVersionLoaded,
	getCompatModeFromKind,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	getLoaderApi,
	InstalledPackage,
	LoaderApi,
} from "./testApi.js";
export { getRequestedVersion, versionToComparisonNumber } from "./versionUtils.js";
