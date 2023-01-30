/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains the interfaces and types concerning the `Loader` and loading the `Container`.
 *
 * @packageDocumentation
 */

export { IAudience, IAudienceOwner } from "./audience";
export {
	IFluidBrowserPackage,
	IFluidBrowserPackageEnvironment,
	isFluidBrowserPackage,
} from "./browserPackage";
export {
	IConnectionDetails,
	IDeltaHandlerStrategy,
	IDeltaManager,
	IDeltaManagerEvents,
	IDeltaSender,
	IDeltaQueue,
	IDeltaQueueEvents,
	ReadOnlyInfo,
} from "./deltas";
export {
	ContainerErrorType,
	ContainerWarning,
	ICriticalContainerError,
	IErrorBase,
	IGenericError,
	IUsageError,
	IThrottlingWarning,
} from "./error";
export {
	ConnectionState,
	ICodeAllowList,
	ICodeDetailsLoader,
	IContainer,
	IContainerEvents,
	IContainerLoadMode,
	IFluidCodeResolver,
	IFluidModuleWithDetails,
	IHostLoader,
	ILoader,
	ILoaderHeader,
	ILoaderOptions,
	IPendingLocalState,
	IProvideLoader,
	IResolvedFluidCodeDetails,
	ISnapshotTreeWithBlobContents,
	LoaderHeader,
} from "./loader";
export { IFluidModule } from "./fluidModule";
export {
	IFluidPackage,
	IFluidPackageEnvironment,
	IFluidCodeDetails,
	IFluidCodeDetailsComparer,
	IFluidCodeDetailsConfig,
	IProvideFluidCodeDetailsComparer,
	isFluidPackage,
	isFluidCodeDetails,
} from "./fluidPackage";
export {
	AttachState,
	IBatchMessage,
	IContainerContext,
	IProvideRuntimeFactory,
	IRuntime,
	IRuntimeFactory,
} from "./runtime";
export { IFluidTokenProvider, IProvideFluidTokenProvider } from "./tokenProvider";
