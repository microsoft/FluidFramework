/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils";
import { ITelemetryBaseEvent, ITelemetryGenericEvent } from "@fluidframework/common-definitions";

export class IgnoreErrorLogger extends EventAndErrorTrackingLogger {
    private readonly ignoredEvents: Map<string, ITelemetryGenericEvent> = new Map();

    public ignoreExpectedEventTypes(...anyIgnoredEvents: ITelemetryGenericEvent[]) {
        for (const event of anyIgnoredEvents) {
            this.ignoredEvents.set(event.eventName, event);
        }
    }

    send(event: ITelemetryBaseEvent): void {
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
