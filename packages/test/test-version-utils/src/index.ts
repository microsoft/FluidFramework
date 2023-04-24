/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export { mochaGlobalSetup } from "./compatConfig";
export {
	getDataStoreFactory,
	getVersionedTestObjectProvider,
	ITestDataObject,
	TestDataObjectType,
} from "./compatUtils";
export { describeInstallVersions } from "./describeWithVersions";
export {
	DescribeCompat,
	DescribeCompatSuite,
	describeFullCompat,
	describeLoaderCompat,
	describeNoCompat,
	ITestObjectProviderOptions,
} from "./describeCompat";
export {
	describeE2EDocs,
	DocumentType,
	DescribeE2EDocInfo,
	BenchmarkType,
	describeE2EDocsMemory,
	describeE2EDocsRuntime,
	describeE2EDocRun,
	getCurrentBenchmarkType,
	isMemoryTest,
} from "./describeE2eDocs";
export { ExpectedEvents, ExpectsTest, itExpects } from "./itExpects";
export {
	ensurePackageInstalled,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	getLoaderApi,
} from "./testApi";
