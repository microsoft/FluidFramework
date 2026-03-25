/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { BrandedType } from "./brandedType.js";
export type { ConfigTypes, IConfigProviderBase } from "./config.js";
export type { IDisposable } from "./disposable.js";
export type { ErasedBaseType, ErasedType, InstanceTypeRelaxed } from "./erasedType.js";
export { ErasedTypeImplementation } from "./erasedType.js";
export type {
	IErrorBase,
	IGenericError,
	ILayerIncompatibilityError,
	IThrottlingWarning,
	IUsageError,
} from "./error.js";
export {
	FluidErrorTypes,
	FluidErrorTypesAlpha,
} from "./error.js";
export type {
	HasListeners,
	IEmitter,
	IsListener,
	Listenable,
	Listeners,
	MapGetSet,
	NoListenersCallback,
	Off,
} from "./events/index.js";
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
// TypeScript forgets the index signature when customers augment IRequestHeader if we export *.
// So we export the explicit members as a workaround:
// https://github.com/microsoft/TypeScript/issues/18877#issuecomment-476921038
export type { IRequest, IRequestHeader, IResponse } from "./fluidRouter.js";
export type {
	IFluidHandleErased,
	IFluidHandleEvents,
	IFluidHandleInternal,
	IFluidHandleInternalPayloadPending,
	IFluidHandlePayloadPending,
	ILocalFluidHandle,
	ILocalFluidHandleEvents,
	IProvideFluidHandle,
	IProvideFluidHandleContext,
	PayloadState,
} from "./handles.js";
export { fluidHandleSymbol, IFluidHandle, IFluidHandleContext } from "./handles.js";
export type {
	ILoggingError,
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryBaseProperties,
	Tagged,
	TelemetryBaseEventPropertyType,
} from "./logger.js";
export { LogLevel } from "./logger.js";
export type { ISignalEnvelope, TypedMessage } from "./messages.js";
export type { FluidObject, FluidObjectKeys, FluidObjectProviderKeys } from "./provider.js";
