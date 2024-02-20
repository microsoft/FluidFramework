/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	LogLevel,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { ITelemetryLoggerExt, ITelemetryPropertiesExt } from "./telemetryTypes.js";
import { createChildLogger } from "./logger.js";

/**
 * The MockLogger records events sent to it, and then can walk back over those events
 * searching for a set of expected events to match against the logged events.
 *
 * @internal
 */
export class MockLogger implements ITelemetryBaseLogger {
	events: ITelemetryBaseEvent[] = [];

	constructor(public readonly minLogLevel?: LogLevel) {}

	clear(): void {
		this.events = [];
	}

	toTelemetryLogger(): ITelemetryLoggerExt {
		return createChildLogger({ logger: this });
	}

	send(event: ITelemetryBaseEvent): void {
		this.events.push(event);
	}

	/**
	 * Search events logged since the last time matchEvents was called, looking for the given expected
	 * events in order.
	 * @param expectedEvents - events in order that are expected to appear in the recorded log.
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 */
	matchEvents(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		inlineDetailsProp: boolean = false,
	): boolean {
		const matchedExpectedEventCount = this.getMatchedEventsCount(
			expectedEvents,
			inlineDetailsProp,
		);
		// How many expected events were left over? Hopefully none.
		const unmatchedExpectedEventCount = expectedEvents.length - matchedExpectedEventCount;
		return unmatchedExpectedEventCount === 0;
	}

	/**
	 * Asserts that matchEvents is true, and prints the actual/expected output if not.
	 */
	assertMatch(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
	): void {
		const actualEvents = this.events;
		if (!this.matchEvents(expectedEvents, inlineDetailsProp)) {
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
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 * @returns if any of the expected events is found.
	 */
	matchAnyEvent(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		inlineDetailsProp: boolean = false,
	): boolean {
		const matchedExpectedEventCount = this.getMatchedEventsCount(
			expectedEvents,
			inlineDetailsProp,
		);
		return matchedExpectedEventCount > 0;
	}

	/**
	 * Asserts that matchAnyEvent is true, and prints the actual/expected output if not.
	 */
	assertMatchAny(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
	): void {
		const actualEvents = this.events;
		if (!this.matchAnyEvent(expectedEvents, inlineDetailsProp)) {
			throw new Error(`${message}
expected:
${JSON.stringify(expectedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
		}
	}

	/**
	 * Search events logged since the last time matchEvents was called, looking only for the given expected
	 * events in order.
	 * @param expectedEvents - events in order that are expected to be the only events in the recorded log.
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 */
	matchEventStrict(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		inlineDetailsProp: boolean = false,
	): boolean {
		return (
			expectedEvents.length === this.events.length &&
			this.matchEvents(expectedEvents, inlineDetailsProp)
		);
	}

	/**
	 * Asserts that matchEvents is true, and prints the actual/expected output if not
	 */
	assertMatchStrict(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
	): void {
		const actualEvents = this.events;
		if (!this.matchEventStrict(expectedEvents, inlineDetailsProp)) {
			throw new Error(`${message}
expected:
${JSON.stringify(expectedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
		}
	}

	/**
	 * Asserts that matchAnyEvent is false for the given events, and prints the actual/expected output if not
	 */
	assertMatchNone(
		disallowedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
	): void {
		const actualEvents = this.events;
		if (this.matchAnyEvent(disallowedEvents, inlineDetailsProp)) {
			throw new Error(`${message}
disallowed events:
${JSON.stringify(disallowedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
		}
	}

	private getMatchedEventsCount(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		inlineDetailsProp: boolean,
	): number {
		let iExpectedEvent = 0;
		for (const event of this.events) {
			if (
				iExpectedEvent < expectedEvents.length &&
				MockLogger.eventsMatch(event, expectedEvents[iExpectedEvent], inlineDetailsProp)
			) {
				// We found the next expected event; increment
				++iExpectedEvent;
			}
		}

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
		inlineDetailsProp: boolean,
	): boolean {
		const { details, ...actualForMatching } = actual;
		// "details" is used in a lot of telemetry logs to group a bunch of properties together and stringify them.
		// Some of the properties in the expected event may be inside "details". So, if inlineDetailsProp is true,
		// extract the properties from "details" in the actual event and inline them in the actual event.
		if (inlineDetailsProp && details !== undefined) {
			assert(
				typeof details === "string",
				// eslint-disable-next-line unicorn/numeric-separators-style
				0x6c9 /* Details should a JSON stringified string if inlineDetailsProp is true */,
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const detailsExpanded = JSON.parse(details);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			return matchObjects({ ...actualForMatching, ...detailsExpanded }, expected);
		}
		return matchObjects(actual, expected);
	}
}

function matchObjects(actual: ITelemetryPropertiesExt, expected: ITelemetryPropertiesExt): boolean {
	for (const [expectedKey, expectedValue] of Object.entries(expected)) {
		const actualValue = actual[expectedKey];
		if (
			!Array.isArray(expectedValue) &&
			expectedValue !== null &&
			typeof expectedValue === "object"
		) {
			if (
				Array.isArray(actualValue) ||
				actualValue === null ||
				typeof actualValue !== "object" ||
				!matchObjects(
					actualValue as ITelemetryPropertiesExt,
					expectedValue as ITelemetryPropertiesExt,
				)
			) {
				return false;
			}
		} else if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
			return false;
		}
	}
	return true;
}
