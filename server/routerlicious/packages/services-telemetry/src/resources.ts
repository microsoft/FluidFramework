/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumber } from "./lumber";

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

export interface ILumberjackEngine {
    emit(lumber: Lumber<string>): void;
}

// We explicitly make the types of ITelemetryMetadata properties include "undefined"
// to make those properties mandatory. Making the property "string | undefined" instead
// of making them optional forces the user to explicitly provide the property as "undefined"
// if it is not available. That's because we want to encourage the user to provide all data
// available for a given component. In other words, we want to avoid that if "tenantId" is
// available, the user forgets including that in ITelemetryMetadata by omitting such property.
export interface ITelemetryMetadata {
    documentId: string | undefined;
    tenantId: string | undefined;
    clientId: string | undefined;
    clientSequenceNumber: number | undefined;
    sequenceNumber: number | undefined;
}
