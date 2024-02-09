/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains the interfaces and types concerning the `Loader` and loading the `Container`.
 *
 * @packageDocumentation
 */

export type { IAudience, IAudienceOwner } from "./audience";
export type { IFluidBrowserPackage, IFluidBrowserPackageEnvironment } from "./browserPackage";
export { isFluidBrowserPackage } from "./browserPackage";
export type {
	IConnectionDetails,
	IDeltaManager,
	IDeltaManagerEvents,
	IDeltaQueue,
	IDeltaQueueEvents,
	IDeltaSender,
	ReadOnlyInfo,
} from "./deltas";
export type { ContainerWarning, ICriticalContainerError } from "./error";
export { ContainerErrorTypes } from "./error";
export type {
	ConnectionState,
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
	IProvideLoader,
	IResolvedFluidCodeDetails,
	ISnapshotTreeWithBlobContents,
} from "./loader";
export { LoaderHeader } from "./loader";
export type { IFluidModule } from "./fluidModule";
export type {
	IFluidPackage,
	IFluidPackageEnvironment,
	IFluidCodeDetails,
	IFluidCodeDetailsConfig,
	IProvideFluidCodeDetailsComparer,
} from "./fluidPackage";
export { IFluidCodeDetailsComparer, isFluidPackage, isFluidCodeDetails } from "./fluidPackage";
export type {
	IBatchMessage,
	IContainerContext,
	IProvideRuntimeFactory,
	IRuntime,
	IGetPendingLocalStateProps,
} from "./runtime";
export { AttachState, IRuntimeFactory } from "./runtime";

export type {
	/**
	 * @deprecated IErrorBase is being deprecated as a public export is moving to "core-interfaces".
	 */
	IErrorBase,
	/**
	 * @deprecated IGenericError is being deprecated as a public export is moving to "core-interfaces".
	 */
	IGenericError,
	/**
	 * @deprecated IThrottlingWarning is being deprecated as a public export is moving to "core-interfaces".
	 */
	IThrottlingWarning,
	/**
	 * @deprecated IUsageError is being deprecated as a public export is moving to "core-interfaces".
	 */
	IUsageError,
} from "@fluidframework/core-interfaces";
