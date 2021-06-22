/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { LumberEventName } from "./lumberEventNames";
import { Lumber } from "./lumber";
import { LogLevel, LumberType, ITelemetryMetadata, ILumberjackEngine } from "./resources";

export class Lumberjack {
    protected static _instance: Lumberjack | undefined = undefined;
    private readonly engineList: ILumberjackEngine[];
    private isSetupCompleted: boolean;

    protected constructor() {
        this.engineList = [];
        this.isSetupCompleted = false;
    }

    public static get instance() {
        if (!Lumberjack._instance) {
            Lumberjack._instance = new Lumberjack();
        }

        return Lumberjack._instance;
    }

    public setupEngines(engines: ILumberjackEngine[]) {
        if (this.isSetupCompleted) {
            throw new Error("This Lumberjack was already setup with a list of engines.");
        }

        this.engineList.push(...engines);
        this.isSetupCompleted = true;
    }

    public newLumberMetric<T extends string = LumberEventName>(eventName: T, metadata: ITelemetryMetadata) {
        this.throwOnEmptyEngineList();
        return new Lumber<T>(eventName, metadata, LumberType.Metric, this.engineList);
    }

    public log(
        message: string,
        metadata: ITelemetryMetadata,
        level: LogLevel,
        properties?: Map<string, any> | Record<string, any> | undefined,
        statusCode?: number | string | undefined,
        exception?: Error | undefined,
    ) {
        this.throwOnEmptyEngineList();
        const lumber = new Lumber<string>(this.getLogCallerInfo(), metadata, LumberType.Log, this.engineList);

        if (properties) {
            if (properties instanceof Map) {
                properties.forEach((value: any, key: string) => { lumber.addProperty(key, value); });
            } else {
                for (const [key, value] of Object.entries(properties)) {
                    lumber.addProperty(key, value);
                }
            }
        }

        if (level === LogLevel.Warning || level === LogLevel.Error) {
            lumber.error(message, statusCode, exception, level);
        } else {
            lumber.success(message, statusCode, level);
        }
    }

    /**
    * For logs, we can use the caller information as a form of ID.
    * In order to do that, we use NodeJS's CallSite to extract information
    * such as filename, function name and number. For more info, see:
    * https://v8.dev/docs/stack-trace-api#customizing-stack-traces
    * @returns {string} filename and function separated by a colon
    */
    private getLogCallerInfo(): string {
        const defaultPrefix = "LogMessage";
        const defaultStackTracePreparer = Error.prepareStackTrace;
        try {
            Error.prepareStackTrace = (_, structuredStackTrace) => {
                const caller = structuredStackTrace[0];
                const fileName = caller.getFileName() ?? "";
                const functionName = caller.getFunctionName() ?? caller.getMethodName() ?? "";
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

    private throwOnEmptyEngineList() {
        if (this.engineList.length === 0) {
            throw new Error("No engine has been defined for Lumberjack yet. Please define an engine before using it.");
        }
    }
}
