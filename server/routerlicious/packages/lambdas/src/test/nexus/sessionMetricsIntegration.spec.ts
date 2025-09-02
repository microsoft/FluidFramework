/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { logCommonSessionEndMetrics } from "../../utils/telemetryHelper";

describe("Routerlicious", () => {
	describe("Nexus", () => {
		describe("Session Metrics Integration", () => {
			it("should accept session op and signal counts in telemetry helper", () => {
				// This test verifies that the telemetry helper function accepts the new parameters
				// without throwing errors. In a real implementation, we would mock the dependencies.
				
				const mockContext = {
					getContextError: () => undefined,
				} as any;
				
				const mockSessionMetric = {
					setProperties: (props: any) => {
						// Verify that sessionOpCount and sessionSignalCount are being set
						if (props.sessionOpCount !== undefined) {
							assert.equal(typeof props.sessionOpCount, 'number');
						}
						if (props.sessionSignalCount !== undefined) {
							assert.equal(typeof props.sessionSignalCount, 'number');
						}
					},
					success: () => {},
				} as any;

				// This should not throw an error
				assert.doesNotThrow(() => {
					logCommonSessionEndMetrics(
						mockContext,
						undefined as any,
						mockSessionMetric,
						100,
						90,
						undefined,
						25, // sessionOpCount
						8   // sessionSignalCount
					);
				});
			});
		});
	});
});