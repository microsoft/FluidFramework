/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getUnexpectedLogErrorException, TestObjectProvider } from "@fluidframework/test-utils";
// eslint-disable-next-line import/no-extraneous-dependencies
import { Context } from "mocha";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createChildLogger, type ITelemetryGenericEventExt } from "@fluidframework/telemetry-utils";

/**
 * @internal
 */
export type ExpectedEvents =
	| ITelemetryGenericEventExt[]
	| Partial<Record<TestDriverTypes, ITelemetryGenericEventExt[]>>;

/**
 * @internal
 */
export function createExpectsTest(orderedExpectedEvents: ExpectedEvents, test: Mocha.AsyncFunc) {
	return async function (this: Context) {
		const provider: TestObjectProvider | undefined = this.__fluidTestProvider;
		if (provider === undefined) {
			throw new Error("Expected __fluidTestProvider on this");
		}
		const orderedEvents = Array.isArray(orderedExpectedEvents)
			? orderedExpectedEvents
			: orderedExpectedEvents[provider.driver.type] ?? [];

		try {
			provider.logger.registerExpectedEvent(...orderedEvents);
			await test.bind(this)();
		} catch (error) {
			// only use TestException if the event is provided.
			// it must be last, as the events are ordered, so all other events must come first
			if (orderedEvents[orderedEvents.length - 1]?.eventName === "TestException") {
				createChildLogger({ logger: provider.logger }).sendErrorEvent(
					{ eventName: "TestException" },
					error,
				);
			} else {
				throw error;
			}
		}
		const err = getUnexpectedLogErrorException(provider.logger);
		if (err !== undefined) {
			throw err;
		}
	};
}

/**
 * @internal
 */
export type ExpectsTest = (
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	test: Mocha.AsyncFunc,
) => Mocha.Test;

/**
 * Similar to mocha's it function, but allow specifying expected events.
 * That must occur during the execution of the test.
 *
 * @internal
 */
export const itExpects: ExpectsTest & Record<"only" | "skip", ExpectsTest> = (
	name: string,
	orderedExpectedEvents: ExpectedEvents,
	test: Mocha.AsyncFunc,
): Mocha.Test => it(name, createExpectsTest(orderedExpectedEvents, test));

itExpects.only = (name: string, orderedExpectedEvents: ExpectedEvents, test: Mocha.AsyncFunc) =>
	it.only(name, createExpectsTest(orderedExpectedEvents, test));

itExpects.skip = (name: string, orderedExpectedEvents: ExpectedEvents, test: Mocha.AsyncFunc) =>
	it.skip(name, createExpectsTest(orderedExpectedEvents, test));
