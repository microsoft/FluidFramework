/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
	toIDeltaManagerFull,
	waitForContainerConnection,
} from "./containerUtils.js";
export type { IEventAndErrorTrackingLogger } from "./eventAndErrorLogger.js";
export {
	EventAndErrorTrackingLogger,
	getUnexpectedLogErrorException,
} from "./eventAndErrorLogger.js";
export { IProvideTestFluidObject, ITestFluidObject } from "./interfaces.js";
// #region Exports with load side-effect
// The below runtime (not "type") exports transitively or directly import
// timeoutUtils.ts, which always executes on import and may patch Mocha's timeout
// handling. That patching only takes effect when consumers use
// @fluid-internal/mocha-test-setup that sets globalThis.getMochaModule.
// @fluid-internal/mocha-test-setup is pervasive in our tests and thus patch
// is usually in effect (when this package is used).
export { LoaderContainerTracker } from "./loaderContainerTracker.js";
export {
	createDataStoreFactory,
	Factory,
	fluidEntryPoint,
	LocalCodeLoader,
	SupportedExportInterfaces,
} from "./localCodeLoader.js";
export {
	createAndAttachContainer,
	createAndAttachContainerUsingProps,
	createLoader,
	createLoaderProps,
} from "./localLoader.js";
export { retryWithEventualValue } from "./retry.js";
export { createTestConfigProvider, ITestConfigProvider } from "./TestConfigs.js";
export type { SummaryInfo } from "./TestSummaryUtils.js";
export {
	createSummarizer,
	createSummarizerCore,
	createSummarizerFromFactory,
	summarizeNow,
} from "./TestSummaryUtils.js";
export {
	createTestContainerRuntimeFactory,
	TestContainerRuntimeFactory,
} from "./testContainerRuntimeFactory.js";
export {
	ChannelFactoryRegistry,
	TestDataObjectKind,
	TestFluidObject,
	TestFluidObjectFactory,
} from "./testFluidObject.js";
export type {
	IDocumentIdStrategy,
	IOpProcessingController,
	ITestContainerConfig,
	ITestObjectProvider,
} from "./testObjectProvider.js";
export {
	createDocumentId,
	DataObjectFactoryType,
	TestObjectProvider,
	TestObjectProviderWithVersionedLoad,
} from "./testObjectProvider.js";
export {
	type TimeoutDurationOption,
	type TimeoutWithError,
	type TimeoutWithValue,
	timeoutAwait,
	timeoutPromise,
} from "./timeoutUtils.js";

// #endregion

export {
	type ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
	type ContainerRuntimeFactoryWithDefaultDataStoreProps,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from "./testContainerRuntimeFactoryWithDefaultDataStore.js";
export { TestFluidObjectInternal } from "./testFluidObjectInternal.js";
