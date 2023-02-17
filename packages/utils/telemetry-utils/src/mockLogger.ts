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

	constructor() {
		super();
	}

	clear() {
		this.events = [];
	}

	send(event: ITelemetryBaseEvent): void {
		this.events.push(event);
	}

	/**
	 * Search events logged since the last time {@link MockLogger.matchEvents}, {@link MockLogger.matchAnyEvent}, or {@link MockLogger.matchEventStrict}
	 * were called, looking for all the given expected events in order.
	 * This doesn't necessarily mean that the expected events are the only ones present; it means that they are present-
	 * and in the specified order, but other events might be interleaved.
	 * To look for *only* the specified events, use {@link MockLogger.matchEventStrict}.
	 * @param expectedEvents - events in order that are expected to appear in the recorded log.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 *
	 * @remarks
	 * Calling this method will clear the internal buffer of saved events.
	 */
	matchEvents(expectedEvents: Omit<ITelemetryBaseEvent, "category">[]): boolean {
		if (expectedEvents.length === 0) {
			throw new Error("Must specify at least 1 event");
		}
		return this.getMatchedEventsCount(expectedEvents) === expectedEvents.length;
	}

	/**
	 * Asserts that {@link MockLogger.matchEvents} is true, and prints the actual/expected output if not.
	 *
	 * @remarks
	 * Calling this method will clear the internal buffer of saved events.
	 */
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
	 * Search events logged since the last time {@link MockLogger.matchEvents}, {@link MockLogger.matchAnyEvent}, or {@link MockLogger.matchEventStrict}
	 * were called, looking for any of the given expected events.
	 * @param expectedEvents - events that are expected to appear in the recorded log.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 * @returns if any of the expected events is found.
	 *
	 * @remarks
	 * Calling this method will clear the internal buffer of saved events.
	 */
	matchAnyEvent(expectedEvents: Omit<ITelemetryBaseEvent, "category">[]): boolean {
		if (expectedEvents.length === 0) {
			throw new Error("Must specify at least 1 event");
		}
		return this.getMatchedEventsCount(expectedEvents) > 0;
	}

	/**
	 * Asserts that {@link MockLogger.matchAnyEvent} is true, and prints the actual/expected output if not.
	 *
	 * @remarks
	 * Calling this method will clear the internal buffer of saved events.
	 */
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

	/**
	 * Search events logged since the last time {@link MockLogger.matchEvents}, {@link MockLogger.matchAnyEvent}, or {@link MockLogger.matchEventStrict}
	 * were called, looking for exactly the given expected events in order (and no others).
	 * @param expectedEvents - events in order that are expected to be the only events in the recorded log.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 *
	 * @remarks
	 * Calling this method will clear the internal buffer of saved events.
	 */
	matchEventStrict(expectedEvents: Omit<ITelemetryBaseEvent, "category">[]): boolean {
		// Note: order matters here; we need to save the value of this.events.length before calling this.getMatchedEventCount,
		// because that function will clear this.events.
		// But we *have* to call it to ensure that the events buffer is cleared.
		const existingEventCount = this.events.length;
		return expectedEvents.length === this.getMatchedEventsCount(expectedEvents) && expectedEvents.length === existingEventCount;
	}

	/**
	 * Asserts that {@link MockLogger.matchEventStrict} is true for the given events, and prints the actual/expected output if not.
	 *
	 * @remarks
	 * Calling this method will clear the internal buffer of saved events.
	 */
	assertMatchStrict(expectedEvents: Omit<ITelemetryBaseEvent, "category">[], message?: string) {
		const actualEvents = this.events;
		if (!this.matchEventStrict(expectedEvents)) {
			throw new Error(`${message}
expected:
${JSON.stringify(expectedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
		}
	}

	/**
	 * Asserts that {@link MockLogger.matchAnyEvent} is false for the given events, and prints the actual/expected output if not.
	 *
	 * @remarks
	 * Calling this method will clear the internal buffer of saved events.
	 */
	assertMatchNone(disallowedEvents: Omit<ITelemetryBaseEvent, "category">[], message?: string) {
		const actualEvents = this.events;
		if (this.matchAnyEvent(disallowedEvents)) {
			throw new Error(`${message}
disallowed events:
${JSON.stringify(disallowedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
		}
	}

	private getMatchedEventsCount(expectedEvents: Omit<ITelemetryBaseEvent, "category">[]): number {
		let iExpectedEvent = 0;
		this.events.forEach((event) => {
			if (
				iExpectedEvent < expectedEvents.length &&
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
	private static eventsMatch(
		actual: ITelemetryBaseEvent,
		expected: Omit<ITelemetryBaseEvent, "category">,
	): boolean {
		const masked = { ...actual, ...expected };
		return JSON.stringify(masked) === JSON.stringify(actual);
	}
}
