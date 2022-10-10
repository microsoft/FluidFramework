/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export { mochaGlobalSetup } from "./compatConfig";
export {
    getVersionedTestObjectProvider,
    TestDataObjectType,
    ITestDataObject,
    getDataStoreFactory,
} from "./compatUtils";
export {
    getLoaderApi,
    getContainerRuntimeApi,
    getDataRuntimeApi,
    getDriverApi,
    ensurePackageInstalled,
} from "./testApi";
export { ExpectedEvents, ExpectsTest, itExpects } from "./itExpects";
export {
    ITestObjectProviderOptions,
    DescribeCompatSuite,
    DescribeCompat,
    describeNoCompat,
    describeLoaderCompat,
    describeFullCompat,
} from "./describeCompat";
