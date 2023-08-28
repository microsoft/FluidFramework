/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import { TelemetryLogger, PerformanceEvent } from "../logger";
import { ITelemetryLoggerExt } from "../telemetryTypes";

class MockLogger extends TelemetryLogger implements ITelemetryLoggerExt {
	public errorsLogged: number = 0;

	constructor() {
		super();
	}

	send(event: ITelemetryBaseEvent): void {
		if (event.category === "error") {
			++this.errorsLogged;
		}
	}
}

describe("PerformanceEvent", () => {
	let logger: MockLogger;
	beforeEach(() => {
		logger = new MockLogger();
	});

	it("Cancel then End", async () => {
		const callback = async (event: PerformanceEvent): Promise<string | void> => {
			const outerPromise: Promise<string> = new Promise((resolve, reject) => {
				Promise.resolve("A")
					.finally(() => {
						reject(new Error("B"));
					})
					.then((val) => {
						event.end({ val });
						resolve("C");
					})
					.catch(() => {});
			});
			return outerPromise.catch(() => {});
		};

		await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "Testing" },
			callback,
			{ start: true, end: true, cancel: "generic" },
			true,
		);
		assert.equal(logger.errorsLogged, 0, "Shouldn't have logged any errors");
	});
});
