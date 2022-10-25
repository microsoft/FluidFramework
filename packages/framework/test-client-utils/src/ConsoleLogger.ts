/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger, ITelemetryBaseEvent } from "@fluidframework/common-definitions";

// Basic implementation of an ITelemetry Logger. This logger will be passed into a client constructor
// and gets hooked up to the container telemetry system.
export class ConsoleLogger implements ITelemetryBaseLogger {
    constructor() {}

    send(event: ITelemetryBaseEvent) {
        event.Event_Time = Date.now();
        console.log(JSON.stringify(event));
    }
}
