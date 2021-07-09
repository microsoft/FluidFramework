/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { performance } from "@fluidframework/common-utils";
import { LumberEventName } from "./lumberEventNames";
import {
    LogLevel,
    LumberType,
    ILumberjackEngine,
    ILumberjackSchemaValidator,
    handleError,
} from "./resources";

// Lumber represents the telemetry data being captured, and it uses a list of
// ILumberjackEngine to emit the data according to the engine implementation.
// Lumber should be created through Lumberjack. Additional properties can be set through
// setProperty(). Once the telemetry event is complete, the user must call either success()
// or error() on Lumber to emit the data.
export class Lumber<T extends string = LumberEventName> {
    private readonly _startTime = performance.now();
    private  _properties = new Map<string, any>();
    private _durationInMs?: number;
    private _successful?: boolean;
    private _message?: string;
    private _exception?: Error;
    private _logLevel?: LogLevel;
    private _completed = false;
    public readonly timestamp = Date.now();
    public readonly id = uuid();

    public get properties(): Map<string, any> {
        return this._properties;
    }

    public get durationInMs(): number | undefined {
        if (this.type === LumberType.Log) {
            return undefined;
        }
        return this._durationInMs;
    }

    public get successful(): boolean | undefined {
        if (this.type === LumberType.Log) {
            return undefined;
        }
        return this._successful;
    }

    public get message(): string | undefined {
        return this._message;
    }

    public get exception(): Error | undefined {
        return this._exception;
    }

    public get logLevel(): LogLevel | undefined {
        return this._logLevel;
    }

    constructor(
        public readonly eventName: T,
        public readonly type: LumberType,
        private readonly _engineList: ILumberjackEngine[],
        private readonly _schemaValidator?: ILumberjackSchemaValidator,
        properties?: Map<string, any> | Record<string, any>) {
            if (properties) {
                this.setProperties(properties);
            }
        }

    public setProperty(key: string, value: any): this {
        this._properties.set(key, value);
        return this;
    }

    public setProperties(properties: Map<string, any> | Record<string, any>): this {
        if (properties instanceof Map) {
            if (this._properties.size === 0) {
                this._properties = properties;
            } else {
                properties.forEach((value: any, key: string) => { this.setProperty(key, value); });
            }
        } else {
            Object.entries(properties).forEach((entry) => {
                const [key, value] = entry;
                this.setProperty(key,value);
            });
        }
        return this;
    }

    public success(
        message: string,
        logLevel: LogLevel = LogLevel.Info) {
        this.emit(message, logLevel, true, undefined);
    }

    public error(
        message: string,
        exception?: Error,
        logLevel: LogLevel = LogLevel.Error) {
        this.emit(message, logLevel, false, exception);
    }

    private emit(
        message: string,
        logLevel: LogLevel,
        successful: boolean,
        exception: Error | undefined) {
        if (this._completed) {
            handleError(
                LumberEventName.LumberjackError,
                `Trying to complete a Lumber telemetry operation that has alredy been completed.\
                [eventName: ${this.eventName}][id: ${this.id}]`,
                this._engineList);
            return;
        }

        if (this._schemaValidator) {
            const validation = this._schemaValidator.validate(this.properties);
            if (!validation.validationPassed) {
                handleError(
                    LumberEventName.LumberjackSchemaValidationFailure,
                    `Schema validation failed for properties: ${validation.validationFailedForProperties.toString()}.\
                    [eventName: ${this.eventName}][id: ${this.id}]`,
                    this._engineList);
            }
        }

        this._message = message;
        this._logLevel = logLevel;
        this._successful = successful;
        this._exception = exception;
        this._durationInMs = performance.now() - this._startTime;

        this._engineList.forEach((engine) => engine.emit(this));
        this._completed = true;
    }
}
