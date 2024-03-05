/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { IDisposable } from "./disposable.js";

export type { IErrorBase, IGenericError, IUsageError, IThrottlingWarning } from "./error.js";
export { FluidErrorTypes } from "./error.js";

export type {
	ExtendEventProvider,
	IErrorEvent,
	IEvent,
	IEventProvider,
	IEventThisPlaceHolder,
	IEventTransformer,
	ReplaceIEventThisPlaceHolder,
	TransformedEvent,
} from "./events.js";

export type { IProvideFluidLoadable, IProvideFluidRunnable } from "./fluidLoadable.js";
export { IFluidLoadable, IFluidRunnable } from "./fluidLoadable.js";

export type {
	IFluidPackageEnvironment,
	IFluidPackage,
	IFluidCodeDetailsConfig,
	IFluidCodeDetails,
	IProvideFluidCodeDetailsComparer,
} from "./fluidPackage.js";
export { isFluidPackage, isFluidCodeDetails, IFluidCodeDetailsComparer } from "./fluidPackage.js";

// TypeScript forgets the index signature when customers augment IRequestHeader if we export *.
// So we export the explicit members as a workaround:
// https://github.com/microsoft/TypeScript/issues/18877#issuecomment-476921038
export type { IRequest, IRequestHeader, IResponse } from "./fluidRouter.js";

export type { IProvideFluidHandleContext, IProvideFluidHandle } from "./handles.js";
export { IFluidHandleContext, IFluidHandle } from "./handles.js";

export type {
	ILoggingError,
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryBaseProperties,
	Tagged,
	TelemetryBaseEventPropertyType,
} from "./logger.js";
export { LogLevel } from "./logger.js";
export type { FluidObjectProviderKeys, FluidObject, FluidObjectKeys } from "./provider.js";
export type { ConfigTypes, IConfigProviderBase } from "./config.js";
export type { ISignalEnvelope } from "./messages.js";
