/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { IDisposable } from "./disposable";

export type { IErrorBase, IGenericError, IUsageError, IThrottlingWarning } from "./error";
export { FluidErrorTypes } from "./error";

export type {
	ExtendEventProvider,
	IErrorEvent,
	IEvent,
	IEventProvider,
	IEventThisPlaceHolder,
	IEventTransformer,
	ReplaceIEventThisPlaceHolder,
	TransformedEvent,
} from "./events";

export type { IProvideFluidLoadable, IProvideFluidRunnable } from "./fluidLoadable";
export { IFluidLoadable, IFluidRunnable } from "./fluidLoadable";

export type {
	IFluidPackageEnvironment,
	IFluidPackage,
	IFluidCodeDetailsConfig,
	IFluidCodeDetails,
	IProvideFluidCodeDetailsComparer,
} from "./fluidPackage";
export { isFluidPackage, isFluidCodeDetails, IFluidCodeDetailsComparer } from "./fluidPackage";

// TypeScript forgets the index signature when customers augment IRequestHeader if we export *.
// So we export the explicit members as a workaround:
// https://github.com/microsoft/TypeScript/issues/18877#issuecomment-476921038
export type { IRequest, IRequestHeader, IResponse } from "./fluidRouter";

export type { IProvideFluidHandleContext, IProvideFluidHandle } from "./handles";
export { IFluidHandleContext, IFluidHandle } from "./handles";

export type {
	ILoggingError,
	ITaggedTelemetryPropertyType, // deprecated
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryBaseProperties,
	Tagged,
	TelemetryBaseEventPropertyType,
	TelemetryEventPropertyType, // deprecated
} from "./logger";
export { LogLevel } from "./logger";
export type { FluidObjectProviderKeys, FluidObject, FluidObjectKeys } from "./provider";
export type { ConfigTypes, IConfigProviderBase } from "./config";
export type { ISignalEnvelope } from "./messages";
