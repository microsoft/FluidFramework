/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger, ITelemetryBaseEvent } from "@fluidframework/common-definitions";

export class ConsoleLogger implements ITelemetryBaseLogger {
    constructor() {}

    send(event: ITelemetryBaseEvent) {
        event.Event_Time = Date.now();
        console.log(JSON.stringify(event));
    }
}
