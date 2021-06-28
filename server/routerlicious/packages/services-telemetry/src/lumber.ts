/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "@fluidframework/common-utils";
import { LumberEventName } from "./lumberEventNames";
import { LogLevel, LumberType, ILumberjackEngine, ILumberjackSchemaValidator } from "./resources";

// Lumber represents the telemetry data being captured, and it uses a list of
// ILumberjackEngine to emit the data according to the engine implementation.
// Lumber should be created through Lumberjack. Additional properties can be added through
// addProperty(). Once the telemetry event is complete, the user must call either success()
// or error() on Lumber to emit the data.
export class Lumber<T extends string = LumberEventName> {
    private readonly _startTime = performance.now();
    private  _properties = new Map<string, any>();
    private _durationInMs?: number;
    private _successful?: boolean;
    private _message?: string;
    private _statusCode?: string;
    private _exception?: Error;
    private _logLevel?: LogLevel;
    private _completed = false;
    public readonly timestamp = new Date(Date.now()).toISOString();

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

    public get statusCode(): string | undefined {
        return this._statusCode;
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
                this.addProperties(properties);
            }
        }

    public addProperty(key: string, value: any): this {
        this._properties.set(key, value);
        return this;
    }

    public addProperties(properties: Map<string, any> | Record<string, any>): this {
        if (properties instanceof Map) {
            if (this._properties.size === 0) {
                this._properties = properties;
            } else {
                properties.forEach((value: any, key: string) => { this.addProperty(key, value); });
            }
        } else {
            Object.entries(properties).forEach((entry) => {
                const [key, value] = entry;
                this.addProperty(key,value);
            });
        }
        return this;
    }

    public success(
        message: string,
        statusCode: number | string | undefined,
        logLevel: LogLevel = LogLevel.Info) {
        this.emit(message, statusCode, logLevel, true);
    }

    public error(
        message: string,
        statusCode: number | string | undefined,
        exception?: Error | undefined,
        logLevel: LogLevel = LogLevel.Error) {
        this.emit(message, statusCode, logLevel, false, exception);
    }

    private emit(
        message: string,
        statusCode: number | string | undefined,
        logLevel: LogLevel,
        successful: boolean,
        exception?: Error) {
        if (this._completed) {
            throw new Error(
                `Trying to complete a Lumber telemetry operation ${this.eventName} that has alredy been completed.`);
        }

        if (this._schemaValidator) {
            const validation = this._schemaValidator.validate(this.properties);

            if (!validation.validationPassed) {
                throw new Error(
                    `Schema validation failed for properties: ${validation.validationFailedForProperties.toString()}`);
            }
        }

        this._message = message;
        if (statusCode) {
            this._statusCode = statusCode.toString();
        }
        this._logLevel = logLevel;
        this._successful = successful;
        this._exception = exception;
        this._durationInMs = performance.now() - this._startTime;

        this._engineList.forEach((engine) => engine.emit(this));
        this._completed = true;
    }
}
