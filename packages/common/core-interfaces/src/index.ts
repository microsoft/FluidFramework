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

// Typescript forgets the index signature when customers augment IRequestHeader if we export *.
// So we export the explicit members as a workaround:
// https://github.com/microsoft/TypeScript/issues/18877#issuecomment-476921038
export {
	IRequest,
	IRequestHeader,
	IResponse,
	IProvideFluidRouter,
	IFluidRouter,
} from "./fluidRouter";

export {
	IFluidHandleContext,
	IProvideFluidHandleContext,
	IFluidHandle,
	IProvideFluidHandle,
} from "./handles";

export type {
	ILoggingError,
	ITaggedTelemetryPropertyType,
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryErrorEvent,
	ITelemetryGenericEvent,
	ITelemetryLogger,
	ITelemetryPerformanceEvent,
	ITelemetryProperties,
	TelemetryEventCategory,
	TelemetryEventPropertyType,
} from "./logger";

export { FluidObjectProviderKeys, FluidObject, FluidObjectKeys } from "./provider";
