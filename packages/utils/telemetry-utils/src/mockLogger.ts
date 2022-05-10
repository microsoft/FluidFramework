/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { TelemetryLogger } from "./logger";

/**
 * The MockLogger records events sent to it, and then can walk back over those events
 * searching for a set of expected events to match against the logged events.
 */
export class MockLogger extends TelemetryLogger implements ITelemetryLogger {
    events: ITelemetryBaseEvent[] = [];

    constructor() { super(); }

    clear() {
        this.events = [];
    }

    send(event: ITelemetryBaseEvent): void {
        this.events.push(event);
    }

    /**
     * Search events logged since the last time matchEvents was called, looking for the given expected
     * events in order.
     * @param expectedEvents - events in order that are expected to appear in the recorded log.
     * These event objects may be subsets of the logged events.
     * Note: category is ommitted from the type because it's usually uninteresting and tedious to type.
     */
    matchEvents(expectedEvents: Omit<ITelemetryBaseEvent, "category">[]): boolean {
        const matchedExpectedEventCount = this.getMatchedEventsCount(expectedEvents);
        // How many expected events were left over? Hopefully none.
        const unmatchedExpectedEventCount = expectedEvents.length - matchedExpectedEventCount;
        return unmatchedExpectedEventCount === 0;
    }

    /** Asserts that matchEvents is true, and prints the actual/expected output if not */
    assertMatch(expectedEvents: Omit<ITelemetryBaseEvent, "category">[], message?: string) {
        const actualEvents = this.events;
        if (!this.matchEvents(expectedEvents)) {
            throw new Error(`${message}
expected:
${JSON.stringify(expectedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
        }
    }

    /**
     * Search events logged since the last time matchEvents was called, looking for any of the given
     * expected events.
     * @param expectedEvents - events that are expected to appear in the recorded log.
     * These event objects may be subsets of the logged events.
     * Note: category is ommitted from the type because it's usually uninteresting and tedious to type.
     * @returns if any of the expected events is found.
     */
    matchAnyEvent(expectedEvents: Omit<ITelemetryBaseEvent, "category">[]): boolean {
        const matchedExpectedEventCount = this.getMatchedEventsCount(expectedEvents);
        return matchedExpectedEventCount > 0;
    }

    /** Asserts that matchAnyEvent is true, and prints the actual/expected output if not */
    assertMatchAny(expectedEvents: Omit<ITelemetryBaseEvent, "category">[], message?: string) {
        const actualEvents = this.events;
        if (!this.matchAnyEvent(expectedEvents)) {
            throw new Error(`${message}
expected:
${JSON.stringify(expectedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
            }
    }

    private getMatchedEventsCount(expectedEvents: Omit<ITelemetryBaseEvent, "category">[]): number {
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

        // Return the count of matched events.
        return iExpectedEvent;
    }

    /**
     * Ensure the expected event is a strict subset of the actual event
     */
    private static eventsMatch(actual: ITelemetryBaseEvent, expected: Omit<ITelemetryBaseEvent, "category">): boolean {
        const masked = { ...actual, ...expected };
        return JSON.stringify(masked) === JSON.stringify(actual);
    }
}
