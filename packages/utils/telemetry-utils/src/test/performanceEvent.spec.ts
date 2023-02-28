/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { TelemetryLogger, PerformanceEvent } from "../logger";

class MockLogger extends TelemetryLogger implements ITelemetryLogger {
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
		const callback = async (event: PerformanceEvent) => {
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

		await PerformanceEvent.timedExecAsync(logger, { eventName: "Testing" }, callback);
		assert(logger.errorsLogged === 0, "Shouldn't have logged any errors");
	});
});
