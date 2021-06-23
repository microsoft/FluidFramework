/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LumberEventName } from "./lumberEventNames";
import { LogLevel, LumberType, ITelemetryMetadata, ILumberjackEngine } from "./resources";

// Lumber represents the telemetry data being captured, and it uses a list of
// ILumberjackEngine to emit the data according to the engine implementation.
// Lumber should be created through Lumberjack. Additional properties can be added through
// addProperty(). Once the telemetry event is complete, the user must call either success()
// or error() on Lumber to emit the data.
export class Lumber<T extends string = LumberEventName> {
    public readonly properties = new Map<string, any>();
    private readonly startTime = Date.now();
    public readonly timestamp = new Date(this.startTime).toISOString();
    private _metadata?: ITelemetryMetadata;
    private _durationInMs?: number;
    private _successful?: boolean;
    private _message?: string;
    private _statusCode?: string;
    private _exception?: Error;
    private _logLevel?: LogLevel;
    private completed = false;

    public get metadata(): ITelemetryMetadata | undefined {
        return this._metadata;
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
        private readonly engineList: ILumberjackEngine[]) {}

    public addProperty(key: string, value: any): this {
        this.properties.set(key, value);
        return this;
    }

    public success(
        message: string,
        statusCode: number | string | undefined,
        metadata: ITelemetryMetadata,
        logLevel: LogLevel = LogLevel.Info) {
        this.emit(message, statusCode, metadata, logLevel, true);
    }

    public error(
        message: string,
        statusCode: number | string | undefined,
        metadata: ITelemetryMetadata,
        exception?: Error | undefined,
        logLevel: LogLevel = LogLevel.Error) {
        this.emit(message, statusCode, metadata, logLevel, false, exception);
    }

    private emit(
        message: string,
        statusCode: number | string | undefined,
        metadata: ITelemetryMetadata,
        logLevel: LogLevel,
        successful: boolean,
        exception?: Error) {
        if (this.completed) {
            throw new Error(
                `Trying to complete a Lumber telemetry operation ${this.eventName} that has alredy been completed.`);
        }

        this._message = message;
        if (statusCode) {
            this._statusCode = statusCode.toString();
        }
        this._metadata = metadata;
        this._logLevel = logLevel;
        this._successful = successful;
        this._exception = exception;
        this._durationInMs = Date.now() - this.startTime;

        for (const engine of this.engineList) {
            engine.emit(this);
        }

        this.completed = true;
    }
}
