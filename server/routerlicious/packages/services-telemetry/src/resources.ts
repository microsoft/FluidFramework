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

export enum SchemaProperties {
    tenantId = "tenantId",
    documentId = "documentId",
    clientId = "clientId",
    sequenceNumber = "sequenceNumber",
    clientSequenceNumber = "clientSequenceNumber",
}

export interface ILumberjackEngine {
    emit(lumber: Lumber<string>): void;
}

export interface ILumberjackSchemaValidationResult {
    validationPassed: boolean;
    validationFailedForProperties: string[];
}

export interface ILumberjackSchemaValidator {
    validate(props: Map<string, any>): ILumberjackSchemaValidationResult;
}
