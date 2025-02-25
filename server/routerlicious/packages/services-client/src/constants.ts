/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * HTTP Header name for a request/action's Correlation Id to trace an action across services.
 * @internal
 */
export const CorrelationIdHeaderName = "x-correlation-id";
/**
 * HTTP Header name for the client's Driver Version to be sent to the service for telemetry purposes.
 * @internal
 */
export const DriverVersionHeaderName = "x-driver-version";
/**
 * HTTP Header name for Telemetry Context data being passed from service to service.
 * @internal
 */
export const TelemetryContextHeaderName = "x-telemetry-context";

/**
 * This ID is an alias to the latest summary known by the service.
 * @internal
 */
export const LatestSummaryId = "latest";
