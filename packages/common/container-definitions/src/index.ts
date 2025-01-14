/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains the interfaces and types concerning the `Loader` and loading the `Container`.
 *
 * @packageDocumentation
 */

export type { IAudience, IAudienceOwner, IAudienceEvents, ISelf } from "./audience.js";
export type {
	IFluidBrowserPackage,
	IFluidBrowserPackageEnvironment,
} from "./browserPackage.js";
export { isFluidBrowserPackage } from "./browserPackage.js";
export type {
	IConnectionDetails,
	IDeltaManager,
	IDeltaManagerEvents,
	IDeltaManagerFull,
	IDeltaQueue,
	IDeltaQueueEvents,
	IDeltaSender,
	ReadOnlyInfo,
} from "./deltas.js";
export { isIDeltaManagerFull } from "./deltas.js";
export type { ContainerWarning, ICriticalContainerError } from "./error.js";
export { ContainerErrorTypes } from "./error.js";
export type {
	ConnectionState,
	ICodeDetailsLoader,
	IContainer,
	IContainerEvents,
	IContainerLoadMode,
	IContainerPolicies,
	IFluidCodeResolver,
	IFluidModuleWithDetails,
	IHostLoader,
	ILoader,
	ILoaderHeader,
	ILoaderOptions,
	IProvideLoader,
	IResolvedFluidCodeDetails,
	ISnapshotTreeWithBlobContents,
} from "./loader.js";
export { DisconnectReason, LoaderHeader } from "./loader.js";
export type { IFluidModule } from "./fluidModule.js";
export type {
	IFluidPackage,
	IFluidPackageEnvironment,
	IFluidCodeDetails,
	IFluidCodeDetailsConfig,
	IProvideFluidCodeDetailsComparer,
} from "./fluidPackage.js";
export {
	IFluidCodeDetailsComparer,
	isFluidPackage,
	isFluidCodeDetails,
} from "./fluidPackage.js";
export type {
	IBatchMessage,
	IContainerContext,
	IProvideRuntimeFactory,
	IRuntime,
	IGetPendingLocalStateProps,
} from "./runtime.js";
export { AttachState, IRuntimeFactory } from "./runtime.js";

export type {
	/**
	 * @deprecated IErrorBase is being deprecated as a public export is moving to "core-interfaces".
	 */
	IErrorBase,
	/**
	 * @deprecated IThrottlingWarning is being deprecated as a public export is moving to "core-interfaces".
	 */
	IThrottlingWarning,
} from "@fluidframework/core-interfaces/internal";
