/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
	LogLevel,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import { createChildLogger } from "./logger.js";
import type {
	ITelemetryEventExt,
	ITelemetryLoggerExt,
	ITelemetryPropertiesExt,
} from "./telemetryTypes.js";

/**
 * Mock {@link @fluidframework/core-interfaces#ITelemetryBaseLogger} implementation.
 *
 * Records events sent to it, and then can walk back over those events, searching for a set of expected events to
 * match against the logged events.
 *
 * @alpha
 */
export class MockLogger implements ITelemetryBaseLogger {
	// TODO: don't expose mutability to external consumers
	public events: ITelemetryBaseEvent[] = [];

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseLogger.minLogLevel}
	 */
	public readonly minLogLevel: LogLevel;

	public constructor(minLogLevel?: LogLevel) {
		this.minLogLevel = minLogLevel ?? LogLevel.default;
	}

	public clear(): void {
		this.events = [];
	}

	public toTelemetryLogger(): ITelemetryLoggerExt {
		return createChildLogger({ logger: this });
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseLogger.send}
	 */
	public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
		if (logLevel ?? LogLevel.default >= this.minLogLevel) {
			this.events.push(event);
		}
	}

	/**
	 * Search events logged since the last time matchEvents was called, looking for the given expected
	 * events in order.
	 * @param expectedEvents - events in order that are expected to appear in the recorded log.
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 */
	public matchEvents(
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
	public assertMatch(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
	): void {
		const actualEvents = this.events;
		if (!this.matchEvents(expectedEvents, inlineDetailsProp)) {
			throw new Error(`${message ?? "Logs don't match"}
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
	public matchAnyEvent(
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
	public assertMatchAny(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
	): void {
		const actualEvents = this.events;
		if (!this.matchAnyEvent(expectedEvents, inlineDetailsProp)) {
			throw new Error(`${message ?? "Logs don't match"}
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
	public matchEventStrict(
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
	public assertMatchStrict(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
	): void {
		const actualEvents = this.events;
		if (!this.matchEventStrict(expectedEvents, inlineDetailsProp)) {
			throw new Error(`${message ?? "Logs don't match"}
expected:
${JSON.stringify(expectedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
		}
	}

	/**
	 * Asserts that matchAnyEvent is false for the given events, and prints the actual/expected output if not
	 */
	public assertMatchNone(
		disallowedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
	): void {
		const actualEvents = this.events;
		if (this.matchAnyEvent(disallowedEvents, inlineDetailsProp)) {
			throw new Error(`${message ?? "Logs don't match"}
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
		this.clear();

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

function matchObjects(
	actual: ITelemetryPropertiesExt,
	expected: ITelemetryPropertiesExt,
): boolean {
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

/**
 * Mock {@link ITelemetryLoggerExt} implementation.
 *
 * @remarks Can be created via {@link createMockLoggerExt}.
 *
 * @internal
 */
export interface IMockLoggerExt extends ITelemetryLoggerExt {
	/**
	 * Gets the events that have been logged so far.
	 */
	events(): readonly ITelemetryEventExt[];
}

/**
 * Creates an {@link IMockLoggerExt}.
 *
 * @internal
 */
export function createMockLoggerExt(minLogLevel?: LogLevel): IMockLoggerExt {
	const mockLogger = new MockLogger(minLogLevel);
	const childLogger = createChildLogger({ logger: mockLogger });
	Object.assign(childLogger, {
		events: (): readonly ITelemetryEventExt[] =>
			mockLogger.events.map((e) => e as ITelemetryEventExt),
	});
	return childLogger as IMockLoggerExt;
}
