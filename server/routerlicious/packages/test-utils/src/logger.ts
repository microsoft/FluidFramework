/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug as registerDebug, IDebugger } from "debug";
import { ILogger } from "@fluidframework/server-services-core";

/**
 * Implementation of debug logger
 */
export class DebugLogger implements ILogger {
    /**
     * Create logger - all events are output to debug npm library
     * @param namespace - Telemetry event name prefix to add to all events
     */
    public static create(namespace: string): ILogger {
        const debugInfo = registerDebug(namespace);

        const debugWarn = registerDebug(namespace);
        debugWarn.log = console.warn.bind(console);
        debugWarn.enabled = true;

        const debugErr = registerDebug(namespace);
        debugErr.log = console.error.bind(console);
        debugErr.enabled = true;

        return new DebugLogger(debugInfo, debugErr, debugWarn);
    }

    constructor(
        private readonly debugInfo: IDebugger,
        private readonly debugErr: IDebugger,
        private readonly debugWarn: IDebugger) {
    }

    public info(message: string) {
        this.debugInfo(message);
    }

    public warn(message: string) {
        this.debugWarn(message);
    }

    public error(message: string) {
        this.debugErr(message);
    }
}
