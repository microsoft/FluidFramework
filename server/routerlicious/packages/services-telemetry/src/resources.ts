/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { serializeError } from "serialize-error";
import { Lumber } from "./lumber";
import { LumberEventName } from "./lumberEventNames";

const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;

export enum LogLevel {
    Error,
    Warning,
    Info,
    Verbose,
    Debug,
}

export enum LumberType {
    Metric,
    Log,
}

export enum BaseTelemetryProperties {
    tenantId = "tenantId",
    documentId = "documentId",
    correlationId = "correlationId",
}

// Incoming message properties
export enum QueuedMessageProperties {
    topic = "topic",
    partition = "partition",
    offset = "offset",
}

export enum HttpProperties {
    contentLength = "contentLength",
    driverVersion = "driverVersion",
    method = "method",
    pathCategory = "pathCategory",
    responseTime = "responseTime",
    status = "status",
    url = "url",
}

export enum CommonProperties {
    // Client properties
    clientId = "clientId",
    clientType = "clientType",
    clientCount = "clientCount",
    clientDriverVersion = "clientDriverVersion",

    // Session properties
    sessionState = "sessionState",
    sessionEndReason = "sessionEndReason",

    // Post checkpoint properties
    minSequenceNumber = "minSequenceNumber",
    sequenceNumber = "sequenceNumber",
    checkpointOffset = "checkpointOffset",

    // Summary properties
    clientSummarySuccess = "clientSummarySuccess",
    serviceSummarySuccess = "serviceSummarySuccess",
    maxOpsSinceLastSummary = "maxOpsSinceLastSummary",
    lastSummarySequenceNumber = "lastSummarySequenceNumber",

    // Logtail properties
    minLogtailSequenceNumber = "minLogtailSequenceNumber",
    maxLogtailSequenceNumber = "maxLogtailSequenceNumber",

    // Request properties
    statusCode = "statusCode",

    // Miscellaneous properties
    restart = "restart",
    serviceName = "serviceName",
    telemetryGroupName = "telemetryGroupName",
}

export enum ThrottlingTelemetryProperties {
    // Use throttleId as key
    key = "key",

    // Throttle reason
    reason = "reason",

    // Retry after in seconds
    retryAfterInSeconds = "retryAfterInSeconds",

    // Log throttleOptions.weight
    weight = "weight",
}

export enum SessionState {
    // State set when the document lambdas are up and first op for the document is ticketed
    started = "started",

    // Resumed existing session
    resumed = "resumed",

    // State set when a kafka rebalance is triggered or the node process exits
    paused = "paused",

    // State set when the session ends
    end = "end",

    // State set when a lambda could not start successfully
    LambdaStartFailed = "lambdaStartFailed",
}

// Implementations of ILumberjackEngine are used by Lumberjack and Lumber
// to process and emit collected data to the appropriate transports.
export interface ILumberjackEngine {
    emit(lumber: Lumber<string>): void;
}

// Implementations of ILumberjackSchemaValidator are used by Lumber to validate the schema
// of the collected data/properties. The schema validation rules can be defined by each individual
// implementation.
export interface ILumberjackSchemaValidator {
    validate(props: Map<string, any>): ILumberjackSchemaValidationResult;
}

export interface ILumberjackSchemaValidationResult {
    validationPassed: boolean;
    validationFailedForProperties: string[];
}

// Helper method to assist with handling Lumberjack/Lumber errors depending on the context.
export function handleError(eventName: LumberEventName, errMsg: string, engineList: ILumberjackEngine[]) {
    // We only want to log Lumberjack errors if running on a Fluid server instance.
    if (!isBrowser && isNode && process?.env?.IS_FLUID_SERVER) {
        const err = new Error(errMsg);
        // If there is no LumberjackEngine specified, making the list empty,
        // we log the error to the console as a last resort, so the information can
        // be found in raw logs.
        if (engineList.length === 0) {
            console.error(serializeError(err));
        } else {
            // Otherwise, we log the error through the current LumberjackEngines.
            const errLumber = new Lumber<LumberEventName>(
                eventName,
                LumberType.Metric,
                engineList);
            errLumber.error(errMsg, err);
        }
    }
}

// Helper method to add commonly used Lumber properties
export const getLumberBaseProperties = (documentId: string, tenantId: string) => ({
    [BaseTelemetryProperties.tenantId]: tenantId,
    [BaseTelemetryProperties.documentId]: documentId,
});
