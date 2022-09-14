/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";

/**
 * Ignores certain error types (does not pay attention to count)
 * Potentially, we may want to raise the severity of telemetry as an error. i.e - inactiveObjectX telemetry
 */
export class IgnoreErrorLogger extends EventAndErrorTrackingLogger {
    public readonly events: ITelemetryBaseEvent[] = [];
    public readonly inactiveObjectEvents: ITelemetryBaseEvent[] = [];
    public readonly errorEvents: ITelemetryBaseEvent[] = [];
    public readonly errorEventStats: { [key: string]: number; } = {};

    send(event: ITelemetryBaseEvent): void {
        this.events.push(event);
        if (event.eventName.includes("InactiveObject")) {
            this.inactiveObjectEvents.push(event);
        }

        // Ignore all errors, otherwise we only run one test.
        if (event.category === "error") {
            const count = this.errorEventStats[event.eventName] ?? 0;
            this.errorEventStats[event.eventName] = count + 1;
            this.errorEvents.push(event);
        }
    }
}
