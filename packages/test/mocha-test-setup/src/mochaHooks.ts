/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBufferedLogger } from "@fluid-internal/test-driver-definitions";
import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import * as mochaModule from "mocha";

import { pkgName } from "./packageVersion.js";

// This will enable capturing the full stack for errors.
// Since this package is only used when we run tests, capturing the full stack is worth it.
// In non-test environments we need to be more cautious as this will incur a perf impact when errors are
// thrown and will take more storage in any logging sink.
// https://v8.dev/docs/stack-trace-api
Error.stackTraceLimit = Number.POSITIVE_INFINITY;

const testVariant = process.env.FLUID_TEST_VARIANT;
const propsDict =
	process.env.FLUID_LOGGER_PROPS != null
		? JSON.parse(process.env.FLUID_LOGGER_PROPS)
		: undefined;

const _global: any = global;

/**
 * A logger that adds context about the current test run to all events logged through it, like the test variant being
 * run (odsp, r11s, etc) and the name of the current test (while in the context of a particular test running).
 */
class FluidTestRunLogger implements ITelemetryBufferedLogger {
	private currentTestName: string | undefined;

	send(event: ITelemetryBaseEvent) {
		// TODO: Remove when issue #7061 is resolved.
		// Don't log this event as we generate too much.
		if (event.eventName === "fluid:telemetry:RouterliciousDriver:readBlob_end") {
			return;
		}

		if (this.currentTestName !== undefined) {
			event.testName = this.currentTestName;
		}
		event.testVariant = testVariant;
		this.parentLogger.send({
			...event,
			// Setting hostname to pkgName is the behavior we had for a long time, so keeping it just in case.
			// But prefer a value set through FLUID_LOGGER_PROPS if it exists.
			hostName: propsDict?.hostName ?? pkgName,
			details: JSON.stringify(propsDict),
		});
	}
	async flush() {
		return this.parentLogger.flush();
	}
	constructor(private readonly parentLogger: ITelemetryBufferedLogger) {}

	/**
	 * Sets the test that is currently running.
	 * The test name will be included in all events logged through the logger until {@link clearCurrentTest} is called.
	 * @param testName - The name of the test that is currently running.
	 */
	public setCurrentTest(testName: string) {
		this.currentTestName = testName;
	}

	/**
	 * Clears the test that is currently running.
	 * Must be called after a given test has completed so that events logged outside the context of a test
	 * don't include the name of the last test that ran.
	 */
	public clearCurrentTest() {
		this.currentTestName = undefined;
	}
}
const nullLogger: ITelemetryBufferedLogger = {
	send: () => {},
	flush: async () => {},
};

// Keep references to the original console functions so we can restore them after each test.
const log = console.log;
const error = console.log;
const warn = console.warn;

let testLogger: FluidTestRunLogger;

/**
 * @internal
 */
export const mochaHooks = {
	beforeAll() {
		// Code in our tests will call the global `getTestLogger` function to get a logger to use.

		// First we call the version of that function that was (potentially) injected dynamicaly to get the logger that it
		// provides and wrap it with a more intelligent logger which adds test-run-related context to all events logged
		// through it. See the documentation on `FluidTestRunLogger` for details.
		const originalLogger = _global.getTestLogger?.() ?? nullLogger;
		testLogger = new FluidTestRunLogger(originalLogger);

		// Then we redefine `getTestLogger` so it returns the wrapper logger.
		// NOTE: if we have other global mocha hooks defined somewhere, they include a `beforeEach` hook, and the module in
		// which they are defined gets loaded before this one, then if that `beforeEach` hook calls `getTestLogger` the logger
		// it will get will still have a lot of the test-run-related context, but not the name of the current test, because
		// it will run before the `beforeEach` hook in this file which sets that.
		_global.getTestLogger = () => testLogger;
	},
	beforeEach(this: Mocha.Context) {
		// If not in verbose mode, suppress console output while the current test runs.
		if (process.env.FLUID_TEST_VERBOSE === undefined) {
			console.log = () => {};
			console.error = () => {};
			console.warn = () => {};
		}

		ensureTestRunLoggerIsInitialized(testLogger);
		testLogger.setCurrentTest(this.currentTest?.fullTitle() ?? "");
		testLogger.send({
			category: "generic",
			eventName: "fluid:telemetry:Test_start",
		});
	},
	afterEach(this: Mocha.Context) {
		ensureTestRunLoggerIsInitialized(testLogger);
		testLogger.send({
			category: "generic",
			eventName: "fluid:telemetry:Test_end",
			state: this.currentTest?.state,
			duration: this.currentTest?.duration,
			timedOut: this.currentTest?.timedOut,
			error: this.currentTest?.err?.message,
			stack: this.currentTest?.err?.stack,
		});

		// Restore console output now that the current test is done running.
		console.log = log;
		console.error = error;
		console.warn = warn;

		// Clear the current test from the logger. Important so if anything calls `getTestLogger` outside the context of a
		// test (e.g. during a `before` or `after` hook), it doesn't log events with the name of the last test that ran.
		testLogger.clearCurrentTest();
	},
};

globalThis.getMochaModule = () => {
	return mochaModule;
};

function ensureTestRunLoggerIsInitialized(
	loggerToTest: FluidTestRunLogger | undefined,
): loggerToTest is FluidTestRunLogger {
	if (loggerToTest instanceof FluidTestRunLogger) {
		return true;
	}
	throw new Error("Test run logger is not initialized");
}
