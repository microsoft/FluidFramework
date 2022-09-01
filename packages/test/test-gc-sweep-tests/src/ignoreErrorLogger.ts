/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils";
import { ITelemetryBaseEvent, ITelemetryGenericEvent } from "@fluidframework/common-definitions";

/**
 * Ignores certain error types (does not pay attention to count)
 * Potentially, we may want to raise the severity of telemetry as an error. i.e - inactiveObjectX telemetry
 */
export class IgnoreErrorLogger extends EventAndErrorTrackingLogger {
    private readonly ignoredEvents: Map<string, ITelemetryGenericEvent> = new Map();
    public readonly events: ITelemetryBaseEvent[] = [];
    public readonly inactiveObjectEvents: ITelemetryBaseEvent[] = [];

    public ignoreExpectedEventTypes(...anyIgnoredEvents: ITelemetryGenericEvent[]) {
        for (const event of anyIgnoredEvents) {
            this.ignoredEvents.set(event.eventName, event);
        }
    }

    send(event: ITelemetryBaseEvent): void {
        this.events.push(event);
        if (event.eventName.includes("InactiveObject")) {
            this.inactiveObjectEvents.push(event);
        }
        // For ignored events, make them generic events.
        if (this.ignoredEvents.has(event.eventName)) {
            let matches = true;
            const ie = this.ignoredEvents.get(event.eventName);
            assert(ie !== undefined);
            for (const key of Object.keys(ie)) {
                if (ie[key] !== event[key]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                event.category = "generic";
            }
        }

        super.send(event);
    }
}
