/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import { MockLogger } from "@fluidframework/telemetry-utils";

import { DevtoolsLogger } from "../DevtoolsLogger";

// TODOs:
// - Test window messaging

describe("DevtoolsLogger unit tests", () => {
	it("Forwards events to base logger", () => {
		const baseLogger = new MockLogger();
		const devtoolsLogger = new DevtoolsLogger(baseLogger);

		const event: ITelemetryBaseEvent = {
			eventName: "test-event",
			category: "test-category",
		};

		devtoolsLogger.send(event);

		expect(baseLogger.events.length).to.equal(1);
		expect(baseLogger.events[0]).to.deep.equal(event);
	});
});
