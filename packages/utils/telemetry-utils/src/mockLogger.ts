/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryLogger, ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";

export class MockLogger extends TelemetryLogger implements ITelemetryLogger {
    events: ITelemetryBaseEvent[] = [];

    constructor() { super(); }

    send(event: ITelemetryBaseEvent): void {
        this.events.push(event);
    }

    matchEvents(expectedEvents: Omit<ITelemetryBaseEvent, "category">[]): boolean {
        let iExpectedEvent = 0;
        this.events.forEach((event) => {
            if (iExpectedEvent < expectedEvents.length &&
                MockLogger.eventsMatch(event, expectedEvents[iExpectedEvent])
            ) {
                // We found the next expected event; increment
                ++iExpectedEvent;
            }
        });

        // Remove the events so far; next call will just compare subsequent events from here
        this.events = [];

        // How many expected events were left over? Hopefully none.
        const unmatchedExpectedEventCount = expectedEvents.length - iExpectedEvent;
        assert(unmatchedExpectedEventCount >= 0);
        return unmatchedExpectedEventCount === 0;
    }

    private static eventsMatch(actual: ITelemetryBaseEvent, expected: Omit<ITelemetryBaseEvent, "category">): boolean {
        const masked = { ...actual, ...expected };
        return JSON.stringify(masked) === JSON.stringify(actual);
    }
}
