/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger, ITelemetryBaseEvent } from "@fluidframework/azure-client";

// Define a custom ITelemetry Logger. This logger will be passed into TinyliciousClient
// and gets hooked up to the Tinylicious container telemetry system.
export class ConsoleLogger implements ITelemetryBaseLogger {
    constructor() {}
    send(event: ITelemetryBaseEvent) {
        console.log("Custom telemetry object array: ".concat(JSON.stringify(event)));
    }
}
