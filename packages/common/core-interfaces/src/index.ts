/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { IDisposable } from "./disposable";

export {
	FluidErrorTypes,
	IErrorBase,
	IGenericError,
	IUsageError,
	IThrottlingWarning,
} from "./error";

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

export {
	IFluidLoadable,
	IProvideFluidLoadable,
	IFluidRunnable,
	IProvideFluidRunnable,
} from "./fluidLoadable";

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

// TypeScript forgets the index signature when customers augment IRequestHeader if we export *.
// So we export the explicit members as a workaround:
// https://github.com/microsoft/TypeScript/issues/18877#issuecomment-476921038
export { IRequest, IRequestHeader, IResponse } from "./fluidRouter";

export {
	IFluidHandleContext,
	IProvideFluidHandleContext,
	IFluidHandle,
	IProvideFluidHandle,
} from "./handles";

export type {
	ILoggingError,
	ITaggedTelemetryPropertyType, // deprecated
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryBaseProperties,
	ITelemetryErrorEvent, // deprecated
	ITelemetryGenericEvent, // deprecated
	ITelemetryLogger, // deprecated
	ITelemetryPerformanceEvent, // deprecated
	ITelemetryProperties, // deprecated
	Tagged,
	TelemetryEventCategory, // deprecated
	TelemetryBaseEventPropertyType,
	TelemetryEventPropertyType, // deprecated
} from "./logger";
export { LogLevel } from "./logger";
export { FluidObjectProviderKeys, FluidObject, FluidObjectKeys } from "./provider";
export { ConfigTypes, IConfigProviderBase } from "./config";
