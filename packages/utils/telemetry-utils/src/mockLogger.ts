/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
	LogLevel,
	type Tagged,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import { createChildLogger } from "./logger.js";
import type {
	ITelemetryEventExt,
	ITelemetryLoggerExt,
	ITelemetryPropertiesExt,
	TelemetryEventPropertyTypeExt,
} from "./telemetryTypes.js";

/**
 * Mock {@link @fluidframework/core-interfaces#ITelemetryBaseLogger} implementation.
 *
 * Records events sent to it, and then can walk back over those events, searching for a set of expected events to
 * match against the logged events.
 *
 * @internal
 */
export class MockLogger implements ITelemetryBaseLogger {
	/**
	 * Gets an immutable copy of the events logged thus far.
	 */
	public get events(): readonly ITelemetryBaseEvent[] {
		return [...this._events];
	}

	private _events: ITelemetryBaseEvent[] = [];

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseLogger.minLogLevel}
	 */
	public readonly minLogLevel: LogLevel;

	public constructor(minLogLevel?: LogLevel) {
		this.minLogLevel = minLogLevel ?? LogLevel.default;
	}

	/**
	 * Clears the events logged thus far.
	 */
	public clear(): void {
		this._events = [];
	}

	public toTelemetryLogger(): ITelemetryLoggerExt {
		return createChildLogger({ logger: this });
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseLogger.send}
	 */
	public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
		if ((logLevel ?? LogLevel.default) >= this.minLogLevel) {
			this._events.push(event);
		}
	}

	/**
	 * Search events logged since the last time matchEvents was called, looking for the given expected
	 * events in order.
	 * @param expectedEvents - events in order that are expected to appear in the recorded log.
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 * @param clearEventsAfterCheck - Whether or not to clear the logger's {@link MockLogger.events} after performing the check.
	 * Default: true.
	 */
	public matchEvents(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		inlineDetailsProp: boolean = false,
		clearEventsAfterCheck: boolean = true,
	): boolean {
		const matchedExpectedEventCount = this.getMatchedEventsCount(
			expectedEvents,
			inlineDetailsProp,
			clearEventsAfterCheck,
		);
		// How many expected events were left over? Hopefully none.
		const unmatchedExpectedEventCount = expectedEvents.length - matchedExpectedEventCount;
		return unmatchedExpectedEventCount === 0;
	}

	/**
	 * Asserts {@link MockLogger.matchEvents} is `true` for the given events.
	 * @param expectedEvents - The events expected to appear.
	 * @param message - Optional error message to include in the thrown error, if the condition is not satisfied.
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 * @param clearEventsAfterCheck - Whether or not to clear the logger's {@link MockLogger.events} after performing the check.
	 * Default: true.
	 * @throws An error containing the actual/expected event data if the condition is not satisfied.
	 */
	public assertMatch(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
		clearEventsAfterCheck: boolean = true,
	): void {
		// Use copy to ensure events aren't cleared out from under us before we (potentially) throw
		const actualEvents = this.events;

		if (!this.matchEvents(expectedEvents, inlineDetailsProp, clearEventsAfterCheck)) {
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
		clearEventsAfterCheck: boolean = true,
	): boolean {
		const matchedExpectedEventCount = this.getMatchedEventsCount(
			expectedEvents,
			inlineDetailsProp,
			clearEventsAfterCheck,
		);
		return matchedExpectedEventCount > 0;
	}

	/**
	 * Asserts {@link MockLogger.matchAnyEvent} is `true` for the given events.
	 * @param expectedEvents - The events expected to appear.
	 * @param message - Optional error message to include in the thrown error, if the condition is not satisfied.
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 * @param clearEventsAfterCheck - Whether or not to clear the logger's {@link MockLogger.events} after performing the check.
	 * Default: true.
	 * @throws An error containing the actual/expected event data if the condition is not satisfied.
	 */
	public assertMatchAny(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
		clearEventsAfterCheck: boolean = true,
	): void {
		// Use copy to ensure events aren't cleared out from under us before we (potentially) throw
		const actualEvents = this.events;

		if (!this.matchAnyEvent(expectedEvents, inlineDetailsProp, clearEventsAfterCheck)) {
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
	 * @param clearEventsAfterCheck - Whether or not to clear the logger's {@link MockLogger.events} after performing the check.
	 * Default: true.
	 */
	public matchEventStrict(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		inlineDetailsProp: boolean = false,
		clearEventsAfterCheck: boolean = true,
	): boolean {
		if (expectedEvents.length !== this._events.length) {
			if (clearEventsAfterCheck) {
				this.clear();
			}
			return false;
		}

		// `events` will be cleared by the below check if requested.
		return this.matchEvents(expectedEvents, inlineDetailsProp, clearEventsAfterCheck);
	}

	/**
	 * Asserts {@link MockLogger.matchEvents} is `true` for the given events.
	 * @param expectedEvents - The events expected to appear.
	 * @param message - Optional error message to include in the thrown error, if the condition is not satisfied.
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 * @param clearEventsAfterCheck - Whether or not to clear the logger's {@link MockLogger.events} after performing the check.
	 * Default: true.
	 * @throws An error containing the actual/expected event data if the condition is not satisfied.
	 */
	public assertMatchStrict(
		expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
		clearEventsAfterCheck: boolean = true,
	): void {
		// Use copy to ensure events aren't cleared out from under us before we (potentially) throw
		const actualEvents = this.events;

		if (!this.matchEventStrict(expectedEvents, inlineDetailsProp, clearEventsAfterCheck)) {
			throw new Error(`${message ?? "Logs don't match"}
expected:
${JSON.stringify(expectedEvents)}

actual:
${JSON.stringify(actualEvents)}`);
		}
	}

	/**
	 * Asserts {@link MockLogger.matchAnyEvent} is `false` for the given events.
	 * @param disallowedEvents - The events expected to not appear.
	 * @param message - Optional error message to include in the thrown error, if the condition is not satisfied.
	 * @param inlineDetailsProp - true if the "details" property in the actual event should be extracted and inlined.
	 * These event objects may be subsets of the logged events.
	 * Note: category is omitted from the type because it's usually uninteresting and tedious to type.
	 * @param clearEventsAfterCheck - Whether or not to clear the logger's {@link MockLogger.events} after performing the check.
	 * Default: true.
	 * @throws An error containing the actual/expected event data if the condition is not satisfied.
	 */
	public assertMatchNone(
		disallowedEvents: Omit<ITelemetryBaseEvent, "category">[],
		message?: string,
		inlineDetailsProp: boolean = false,
		clearEventsAfterCheck: boolean = true,
	): void {
		// Use copy to ensure events aren't cleared out from under us before we (potentially) throw
		const actualEvents = this.events;

		if (this.matchAnyEvent(disallowedEvents, inlineDetailsProp, clearEventsAfterCheck)) {
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
		clearEventsAfterCheck: boolean,
	): number {
		let iExpectedEvent = 0;
		for (const event of this._events) {
			if (
				iExpectedEvent < expectedEvents.length &&
				MockLogger.eventsMatch(event, expectedEvents[iExpectedEvent], inlineDetailsProp)
			) {
				// We found the next expected event; increment
				++iExpectedEvent;
			}
		}

		// Remove the events so far; next call will just compare subsequent events from here
		if (clearEventsAfterCheck) {
			this.clear();
		}

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

	/**
	 * Throws if any errors were logged
	 */
	public assertNoErrors(message?: string, clearEventsAfterCheck: boolean = true): void {
		const actualEvents = this.events;
		const errors = actualEvents.filter((event) => event.category === "error");
		if (clearEventsAfterCheck) {
			this.clear();
		}
		if (errors.length > 0) {
			throw new Error(`${message ?? "Errors found in logs"}

error logs:
${JSON.stringify(errors)}`);
		}
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
