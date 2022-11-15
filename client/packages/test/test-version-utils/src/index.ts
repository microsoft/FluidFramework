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
export {
	DescribeCompat,
	DescribeCompatSuite,
	describeFullCompat,
	describeLoaderCompat,
	describeNoCompat,
	ITestObjectProviderOptions,
} from "./describeCompat";
export { ExpectedEvents, ExpectsTest, itExpects } from "./itExpects";
export {
	ensurePackageInstalled,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	getLoaderApi,
} from "./testApi";
