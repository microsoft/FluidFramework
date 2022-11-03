/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains common interfaces and definitions used by the Fluid Framework.
 *
 * @packageDocumentation
 */

export type { IDisposable } from "./disposable";
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
