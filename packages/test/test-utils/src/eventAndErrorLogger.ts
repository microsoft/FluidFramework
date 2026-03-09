/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { ITelemetryGenericEventExt } from "@fluidframework/telemetry-utils/internal";

import { isNonEmptyArray } from "./nonEmptyArrayType.js";

/** @internal */
export interface IEventAndErrorTrackingLogger {
	registerExpectedEvent: (...orderedExpectedEvents: ITelemetryGenericEventExt[]) => void;
	reportAndClearTrackedEvents: () => {
		expectedNotFound: { index: number; event: ITelemetryGenericEventExt }[];
		unexpectedErrors: ITelemetryBaseEvent[];
	};
}

/**
 * This class tracks events. It allows specifying expected events, which will be looked for in order.
 * It also tracks all unexpected errors.
 * At any point you call reportAndClearTrackedEvents which will provide all unexpected errors, and
 * any expected events that have not occurred.
 * @internal
 */
export class EventAndErrorTrackingLogger
	implements ITelemetryBaseLogger, IEventAndErrorTrackingLogger
{
	/**
	 * Even if these error events are logged, tests should still be allowed to pass
	 * Additionally, if downgrade is true, then log as generic (e.g. to avoid polluting the e2e test logs)
	 */
	private readonly allowedErrors: { eventName: string; downgrade?: true }[] = [
		// This log was removed in current version as unnecessary, but it's still present in previous versions
		{
			eventName: "fluid:telemetry:Container:NoRealStorageInDetachedContainer",
			downgrade: true,
		},
		// This log's category changes depending on the op latency. test results shouldn't be affected but if we see lots we'd like an alert from the logs.
		{ eventName: "fluid:telemetry:OpRoundtripTime" },
	];

	constructor(private readonly baseLogger?: ITelemetryBaseLogger) {}

	private readonly expectedEvents: { index: number; event: ITelemetryGenericEventExt }[] = [];
	private readonly unexpectedErrors: ITelemetryBaseEvent[] = [];

	public registerExpectedEvent(...orderedExpectedEvents: ITelemetryGenericEventExt[]): void {
		if (this.expectedEvents.length !== 0) {
			// we don't have to error here. just no reason not to. given the events must be
			// ordered it could be tricky to figure out problems around multiple registrations.
			throw new Error(
				"Expected events already registered.\n" +
					"Call reportAndClearTrackedEvents to clear them before registering more",
			);
		}
		this.expectedEvents.push(
			...orderedExpectedEvents.map((event, index) => ({ index, event })),
		);
	}

	send(event: ITelemetryBaseEvent): void {
		if (isNonEmptyArray(this.expectedEvents)) {
			const ee = this.expectedEvents[0].event;
			if (ee.eventName === event.eventName) {
				let matches = true;
				for (const key of Object.keys(ee)) {
					if (ee[key] !== event[key]) {
						matches = false;
						break;
					}
				}
				if (matches) {
					// we found an expected event
					// so remove it from the list of expected events
					// and if it is an error, change it to generic
					// this helps keep our telemetry clear of
					// expected errors.
					this.expectedEvents.shift();
					if (event.category === "error") {
						event.category = "generic";
					}
				}
			}
		}
		if (event.category === "error") {
			// Check to see if this error is allowed and if its category should be downgraded
			const allowedError = this.allowedErrors.find(
				({ eventName }) => eventName === event.eventName,
			);

			if (allowedError === undefined) {
				this.unexpectedErrors.push(event);
			} else if (allowedError.downgrade) {
				event.category = "generic";
			}
		}

		this.baseLogger?.send(event);
	}

	public reportAndClearTrackedEvents(): {
		expectedNotFound: { index: number; event: ITelemetryGenericEventExt }[];
		unexpectedErrors: ITelemetryBaseEvent[];
	} {
		const expectedNotFound = this.expectedEvents.splice(0, this.expectedEvents.length);
		const unexpectedErrors = this.unexpectedErrors.splice(0, this.unexpectedErrors.length);
		return {
			expectedNotFound,
			unexpectedErrors,
		};
	}
}

/** Summarize the event with just the primary properties, for succinct output in case of test failure */
const primaryEventProps = ({
	category,
	eventName,
	error,
	errorType,
}: ITelemetryBaseEvent): Partial<ITelemetryBaseEvent> => ({
	category,
	eventName,
	error,
	errorType,
	["..."]: "*** Additional properties not shown, see full log for details ***",
});

/**
 * Retrieves unexpected errors from a logger and returns them as an exception.
 *
 * @internal
 */
export function getUnexpectedLogErrorException(
	logger: IEventAndErrorTrackingLogger | undefined,
	prefix?: string,
): Error | undefined {
	if (logger === undefined) {
		return;
	}
	const results = logger.reportAndClearTrackedEvents();
	if (results.unexpectedErrors.length > 0) {
		return new Error(
			`${prefix ?? ""}Unexpected Errors in Logs:\n${JSON.stringify(
				results.unexpectedErrors.map(primaryEventProps),
				undefined,
				2,
			)}`,
		);
	}
	if (results.expectedNotFound.length > 0) {
		return new Error(
			`${prefix ?? ""}Expected Events not found:\n${JSON.stringify(
				results.expectedNotFound,
				undefined,
				2,
			)}`,
		);
	}
}
