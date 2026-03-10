/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { IEventAndErrorTrackingLogger } from "./eventAndErrorLogger.js";
export {
	EventAndErrorTrackingLogger,
	getUnexpectedLogErrorException,
} from "./eventAndErrorLogger.js";
export { IProvideTestFluidObject, ITestFluidObject } from "./interfaces.js";
export {
	fluidEntryPoint,
	LocalCodeLoader,
	SupportedExportInterfaces,
	Factory,
	createDataStoreFactory,
} from "./localCodeLoader.js";
export {
	createAndAttachContainer,
	createLoader,
	createLoaderProps,
	createAndAttachContainerUsingProps,
} from "./localLoader.js";
export { retryWithEventualValue } from "./retry.js";
export { createTestConfigProvider, ITestConfigProvider } from "./TestConfigs.js";
export {
	createTestContainerRuntimeFactory,
	TestContainerRuntimeFactory,
} from "./testContainerRuntimeFactory.js";
export {
	ChannelFactoryRegistry,
	TestFluidObject,
	TestFluidObjectFactory,
	TestDataObjectKind,
} from "./testFluidObject.js";

// #region Exports with load side-effect
// These exports transitively or directly load timeoutUtils.ts that has load
// side effect of patching Mocha's timeout handling. For the side effect to
// load, consumer must also load mocha-test-setup, which is pervasively used.
export { LoaderContainerTracker } from "./loaderContainerTracker.js";
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
export type { SummaryInfo } from "./TestSummaryUtils.js";
export {
	createSummarizer,
	createSummarizerCore,
	createSummarizerFromFactory,
	summarizeNow,
} from "./TestSummaryUtils.js";
export {
	timeoutAwait,
	timeoutPromise,
	type TimeoutDurationOption,
	type TimeoutWithError,
	type TimeoutWithValue,
} from "./timeoutUtils.js";
export {
	toIDeltaManagerFull,
	waitForContainerConnection,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
} from "./containerUtils.js";
// #endregion

export {
	type ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
	type ContainerRuntimeFactoryWithDefaultDataStoreProps,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from "./testContainerRuntimeFactoryWithDefaultDataStore.js";

export { TestFluidObjectInternal } from "./testFluidObjectInternal.js";
