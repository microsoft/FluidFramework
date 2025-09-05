/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CommonProperties } from "@fluidframework/server-services-telemetry";

describe("Routerlicious", () => {
	describe("Nexus", () => {
		describe("Session Metrics", () => {
			it("should have session op count property defined", () => {
				assert.equal(CommonProperties.sessionOpCount, "sessionOpCount");
			});

			it("should have session signal count property defined", () => {
				assert.equal(CommonProperties.sessionSignalCount, "sessionSignalCount");
			});
		});
	});
});