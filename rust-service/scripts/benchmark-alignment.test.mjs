/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { alignedMeasurement, countInterval } from "./benchmark-alignment.mjs";

test("aligned interval is half-open and does not depend on measured submissions", () => {
	assert.equal(countInterval([9, 10, 11, 19, 20], 10, 20), 3);
});

test("aligned output shape and CPU denominator include every in-interval observation", () => {
	const endpoint = (time, ticks) => ({
		epochBeforeMicros: time,
		epochAfterMicros: time + 100,
		clockDiscrepancyMicros: 0,
		service: { cpuTicks: ticks },
	});
	const worker = {
		observerDeliveryEpochMicros: [500_000, 1_100_000, 2_100_000, 11_100_000],
		measurementClock: {
			anchorUncertaintyMicros: 1,
			endUncertaintyMicros: 1,
			clockDiscrepancyMicros: 1,
		},
	};
	const first = endpoint(1_000_000, 100);
	const last = endpoint(11_000_000, 150);
	assert.deepEqual(alignedMeasurement(first, last, [worker], 100), {
		schemaVersion: 1,
		eventKey: "observerDeliveryEpochMicros",
		startEpochMicros: 1_000_050,
		endEpochMicros: 11_000_050,
		seconds: 10,
		delivered: 2,
		endpointUncertainDeliveries: 0,
		serviceCpuSeconds: 0.5,
		serviceCpuSecondsPerDeliveredOperation: 0.25,
	});
	assert.throws(() => alignedMeasurement(first, last, [{}], 100));
	assert.throws(() =>
		alignedMeasurement({ ...first, clockDiscrepancyMicros: 3000 }, last, [worker], 100),
	);
	assert.throws(() =>
		alignedMeasurement({ ...first, epochAfterMicros: 1_003_000 }, last, [worker], 100),
	);
});
