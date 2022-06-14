/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path-browserify";
import { LumberEventName } from "./lumberEventNames";
import { Lumber } from "./lumber";
import {
    LogLevel,
    LumberType,
    ILumberjackEngine,
    ILumberjackSchemaValidator,
    handleError,
} from "./resources";

// Lumberjack is a telemetry manager class that allows the collection of metrics and logs
// throughout the service. A list of ILumberjackEngine must be provided to Lumberjack
// by calling setup() before Lumberjack can be used - the engines process and emit the collected data.
// An optional ILumberjackSchemaValidator list can be provided to validate the schema of the data.
export class Lumberjack {
    private readonly _engineList: ILumberjackEngine[] = [];
    private _schemaValidators: ILumberjackSchemaValidator[] | undefined;
    private _isSetupCompleted: boolean = false;
    protected static _instance: Lumberjack | undefined;

    protected constructor() {}

    protected static get instance() {
        if (!Lumberjack._instance) {
            Lumberjack._instance = new Lumberjack();
        }

        return Lumberjack._instance;
    }

    public static createInstance(
        engines: ILumberjackEngine[],
        schemaValidators?: ILumberjackSchemaValidator[]) {
        const newInstance = new Lumberjack();
        newInstance.setup(engines, schemaValidators);
        return newInstance;
    }

    public static setup(
        engines: ILumberjackEngine[],
        schemaValidators?: ILumberjackSchemaValidator[]) {
        this.instance.setup(engines, schemaValidators);
    }

    public static newLumberMetric<T extends string = LumberEventName>(
        eventName: T,
        properties?: Map<string, any> | Record<string, any>) {
        return this.instance.newLumberMetric<T>(eventName, properties);
    }

    public static log(
        message: string,
        level: LogLevel,
        properties?: Map<string, any> | Record<string, any>,
        exception?: any) {
        this.instance.log(message, level, properties, exception);
    }

    public static debug(
        message: string,
        properties?: Map<string, any> | Record<string, any>) {
        this.instance.log(message, LogLevel.Debug, properties);
    }

    public static verbose(
        message: string,
        properties?: Map<string, any> | Record<string, any>) {
        this.instance.log(message, LogLevel.Verbose, properties);
    }

    public static info(
        message: string,
        properties?: Map<string, any> | Record<string, any>) {
        this.instance.log(message, LogLevel.Info, properties);
    }

    public static warning(
        message: string,
        properties?: Map<string, any> | Record<string, any>,
        exception?: any) {
        this.instance.log(message, LogLevel.Warning, properties, exception);
    }

    public static error(
        message: string,
        properties?: Map<string, any> | Record<string, any>,
        exception?: any) {
        this.instance.log(message, LogLevel.Error, properties, exception);
    }

    public setup(
        engines: ILumberjackEngine[],
        schemaValidators?: ILumberjackSchemaValidator[]) {
        if (this._isSetupCompleted) {
            handleError(
                LumberEventName.LumberjackError,
                "This Lumberjack was already setup with a list of engines and optional schema validator.",
                this._engineList);
            return;
        }

        if (engines.length === 0) {
            handleError(
                LumberEventName.LumberjackError,
                "The provided engine list is empty. Please provide at list one LumberjackEngine.",
                this._engineList);
            return;
        }

        this._engineList.push(...engines);
        this._schemaValidators = schemaValidators;
        this._isSetupCompleted = true;
    }

    public newLumberMetric<T extends string = LumberEventName>(
        eventName: T,
        properties?: Map<string, any> | Record<string, any>) {
        this.errorOnIncompleteSetup();
        return new Lumber<T>(eventName, LumberType.Metric, this._engineList, this._schemaValidators, properties);
    }

    public static isSetupCompleted() {
        return this.instance._isSetupCompleted;
    }

    public log(
        message: string,
        level: LogLevel,
        properties?: Map<string, any> | Record<string, any>,
        exception?: any) {
        this.errorOnIncompleteSetup();
        const lumber = new Lumber<string>(
            this.getLogCallerInfo(),
            LumberType.Log,
            this._engineList,
            this._schemaValidators,
            properties);

        if (level === LogLevel.Warning || level === LogLevel.Error) {
            lumber.error(message, exception, level);
        } else {
            lumber.success(message, level);
        }
    }

    public debug(
        message: string,
        properties?: Map<string, any> | Record<string, any>) {
        this.log(message, LogLevel.Debug, properties);
    }

    public verbose(
        message: string,
        properties?: Map<string, any> | Record<string, any>) {
        this.log(message, LogLevel.Verbose, properties);
    }

    public info(
        message: string,
        properties?: Map<string, any> | Record<string, any>) {
        this.log(message, LogLevel.Info, properties);
    }

    public warning(
        message: string,
        properties?: Map<string, any> | Record<string, any>,
        exception?: any) {
        this.log(message, LogLevel.Warning, properties, exception);
    }

    public error(
        message: string,
        properties?: Map<string, any> | Record<string, any>,
        exception?: any) {
        this.log(message, LogLevel.Error, properties, exception);
    }

    /**
    * For logs, we can use the caller information as a form of event name
    * until we have a better solution. In order to do that, we use NodeJS's
    * CallSite to extract information such as file name and function name.
    * Caveat: function names do not work properly when using callbacks.
    * For more info, see:
    * https://v8.dev/docs/stack-trace-api#customizing-stack-traces
    * @returns filename and function separated by a colon
    */
    private getLogCallerInfo(): string {
        const defaultPrefix = "LogMessage";
        const defaultStackTracePreparer = Error.prepareStackTrace;
        try {
            Error.prepareStackTrace = (_, structuredStackTrace) => {
                // Since we have a static log() and an instance log(), as well as convenience
                // methods such as info(), error(), etc, we should discard the first entry
                // in the call stack while it points to this Lumberjack file.
                while (structuredStackTrace[0].getFileName() === __filename) {
                    structuredStackTrace.shift();
                }
                const caller = structuredStackTrace[0];
                const fileName = caller.getFileName() ?? "FilenameNotAvailable";
                const functionName = caller.getFunctionName() ?? caller.getMethodName() ?? "FunctionNameNotAvailable";
                return `${defaultPrefix}:${path.basename(fileName)}:${functionName}`;
            };
            const err = new Error();
            // eslint-disable-next-line @typescript-eslint/unbound-method
            Error.captureStackTrace(err, this.log);

            const response = err.stack ?? defaultPrefix;
            return response;
        } catch (err) {
            return defaultPrefix;
        } finally {
            Error.prepareStackTrace = defaultStackTracePreparer;
        }
   }

    private errorOnIncompleteSetup() {
        if (!this._isSetupCompleted) {
            handleError(
                LumberEventName.LumberjackError,
                "Lumberjack has not been setup yet. It requires an engine list and an optional schema validator.",
                this._engineList);
            return;
        }
    }
}
