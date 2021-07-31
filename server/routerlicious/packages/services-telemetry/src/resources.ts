/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumber } from "./lumber";
import { LumberEventName } from "./lumberEventNames";

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
}

// Incoming message properties
export enum QueuedMessageProperties {
    topic = "topic",
    partition = "partition",
    offset = "offset",
}

export enum CommonProperties {
    // Post checkpoint properties
    clientCount = "clientCount",
    minSequenceNumber = "minSequenceNumber",
    sequenceNumber = "sequenceNumber",
    checkpointOffset = "checkpointOffset",

    // Summary related properties
    clientSummarySuccess = "clientSummarySuccess",
    serviceSummarySuccess = "serviceSummarySuccess",
    maxOpsSinceLastSummary = "maxOpsSinceLastSummary",

    // Miscellaneous properties
    restart = "restart",
    telemetryGroupName = "telemetryGroupName",
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
    // If we are running in production, we want to avoid throwing errors that could cause
    // the process to crash - especially since those would be telemetry errors. Instead,
    // we log the error so it can be tracked
    if (process.env.NODE_ENV === "production")
    {
        // If there is no LumberjackEngine specified, making the list empty,
        // we log the error to the console as a last resort, so the information can
        // be found in raw logs.
        if (engineList.length === 0) {
            console.error(errMsg);
        } else {
            // Otherwise, we log the error through the current LumberjackEngines.
            const errLumber = new Lumber<LumberEventName>(
                eventName,
                LumberType.Metric,
                engineList);
            errLumber.error(errMsg);
        }
    } else {
        throw new Error(errMsg);
    }
}
