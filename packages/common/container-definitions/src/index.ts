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
	IDeltaManager,
	IDeltaManagerEvents,
	IDeltaQueue,
	IDeltaQueueEvents,
	IDeltaSender,
	ReadOnlyInfo,
} from "./deltas";
export { ContainerWarning, ICriticalContainerError } from "./error";
export {
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

/**
 * @deprecated IErrorBase is being deprecated as a public export is moving to "core-interfaces".
 */
export { IErrorBase } from "@fluidframework/core-interfaces";

/**
 * @deprecated ContainerErrorType is being deprecated as a public export is moving to "core-interfaces".
 */
export { ContainerErrorType } from "@fluidframework/core-interfaces";

/**
 * @deprecated IGenericError is being deprecated as a public export is moving to "core-interfaces".
 */
export { IGenericError } from "@fluidframework/core-interfaces";

/**
 * @deprecated IThrottlingWarning is being deprecated as a public export is moving to "core-interfaces".
 */
export { IThrottlingWarning } from "@fluidframework/core-interfaces";

/**
 * @deprecated IUsageError is being deprecated as a public export is moving to "core-interfaces".
 */
export { IUsageError } from "@fluidframework/core-interfaces";
