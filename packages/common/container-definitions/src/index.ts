/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains the interfaces and types concerning the `Loader` and loading the `Container`.
 *
 * @packageDocumentation
 */

export { IAudienceOwner, IAudience } from "./audience";
export { IFluidBrowserPackageEnvironment, IFluidBrowserPackage, isFluidBrowserPackage } from "./browserPackage";
export {
    IConnectionDetails,
    IDeltaHandlerStrategy,
    IDeltaSender,
    IDeltaManagerEvents,
    IDeltaManager,
    IDeltaQueueEvents,
    IDeltaQueue,
    ReadOnlyInfo,
} from "./deltas";
export {
    ContainerErrorType,
    IErrorBase,
    ContainerWarning,
    ICriticalContainerError,
    IGenericError,
    IUsageError,
    IThrottlingWarning,
} from "./error";
export {
    IFluidModuleWithDetails,
    ICodeDetailsLoader,
    IResolvedFluidCodeDetails,
    IFluidCodeResolver,
    ICodeAllowList,
    IContainerEvents,
    ConnectionState,
    IContainer,
    ILoader,
    IHostLoader,
    ILoaderOptions,
    LoaderHeader,
    IContainerLoadMode,
    ILoaderHeader,
    IProvideLoader,
    IPendingLocalState,
    ISnapshotTreeWithBlobContents,
} from "./loader";
export { IFluidModule } from "./fluidModule";
export {
    IFluidPackageEnvironment,
    IFluidPackage,
    isFluidPackage,
    IFluidCodeDetailsConfig,
    IFluidCodeDetails,
    isFluidCodeDetails,
    IFluidCodeDetailsComparer,
    IProvideFluidCodeDetailsComparer,
} from "./fluidPackage";
export {
    AttachState,
    IRuntime,
    IBatchMessage,
    IContainerContext,
    IRuntimeFactory,
    IProvideRuntimeFactory,
} from "./runtime";
export { IFluidTokenProvider, IProvideFluidTokenProvider } from "./tokenProvider";
