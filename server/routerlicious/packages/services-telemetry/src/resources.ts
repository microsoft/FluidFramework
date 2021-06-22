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

export interface ITelemetryMetadata {
    documentId: string | undefined;
    tenantId: string | undefined;
    clientId: string | undefined;
    clientSequenceNumber: number | undefined;
    sequenceNumber: number | undefined;
}
