/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LumberEventName } from "./lumberEventNames";
import { LogLevel, LumberType, ITelemetryMetadata, ILumberjackEngine } from "./resources";

export class Lumber<T extends string = LumberEventName> {
    private readonly _eventName: T;
    private readonly _properties: Map<string, any>;
    private readonly _timestamp: string;
    private readonly startTime: number;
    private readonly _metadata: ITelemetryMetadata;
    private readonly _type: LumberType;
    private _latencyInMs: number | undefined;
    private _successful: boolean | undefined;
    private _message: string | undefined;
    private _statusCode: string | undefined;
    private _exception: Error | undefined;
    private _logLevel: LogLevel | undefined;
    private completed: boolean;
    private readonly engineList: ILumberjackEngine[];

    public get eventName(): T {
        return this._eventName;
    }

    public get metadata(): ITelemetryMetadata {
        return this._metadata;
    }

    public get properties(): Map<string, any> {
        return this._properties;
    }

    public get type(): LumberType {
        return this._type;
    }

    public get timestamp(): string {
        return this._timestamp;
    }

    public get latencyInMs(): number | undefined {
        return this._latencyInMs;
    }

    public get successful(): boolean | undefined {
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
        eventName: T,
        metadata: ITelemetryMetadata,
        type: LumberType,
        engineList: ILumberjackEngine[]) {
        this._eventName = eventName;
        this._metadata = metadata;
        this._type = type;
        this.completed = false;
        this._properties = new Map<string, any>();
        this.startTime = Date.now();
        this._timestamp = new Date(this.startTime).toISOString();
        this.engineList = engineList;
        this._latencyInMs = undefined;
        this._successful = undefined;
        this._message = undefined;
        this._statusCode = undefined;
        this._exception = undefined;
        this._logLevel = undefined;
    }

    public addProperty(key: string, value: any): this {
        this._properties.set(key, value);
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
        if (this.completed) {
            throw new Error(
                `Trying to complete a Lumber telemetry operation ${this.eventName} that has alredy been completed.`);
        }

        this._message = message;
        this._logLevel = logLevel;
        if (statusCode) {
            this._statusCode = statusCode.toString();
        }
        this._successful = successful;
        this._exception = exception;
        this._latencyInMs = Date.now() - this.startTime;

        for (const engine of this.engineList) {
            engine.emit(this);
        }

        this.completed = true;
    }
}
