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

export function handleError(eventName: LumberEventName, errMsg: string, engineList: ILumberjackEngine[]) {
    if (process.env.NODE_ENV === "production")
    {
        if (engineList.length === 0) {
            console.log(errMsg);
        } else {
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
