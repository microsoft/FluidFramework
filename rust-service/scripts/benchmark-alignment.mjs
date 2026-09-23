/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";

/** Counts every successful delivery in the half-open CPU interval, regardless of submission time. */
export function countInterval(timestamps, start, end) {
	assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start);
	return timestamps.filter((timestamp) => {
		assert.ok(Number.isSafeInteger(timestamp), "missing/invalid native delivery timestamp");
		return timestamp >= start && timestamp < end;
	}).length;
}

/** Forms the only accepted efficiency denominator, rejecting old worker schemas and clock noise. */
export function alignedMeasurement(
	first,
	last,
	workers,
	clockTicks,
	eventKey = "observerDeliveryEpochMicros",
) {
	assert.ok(first && last, "missing CPU endpoints");
	for (const worker of workers) {
		assert.ok(Array.isArray(worker[eventKey]), "native aligned delivery telemetry required");
		for (const key of [
			"anchorUncertaintyMicros",
			"endUncertaintyMicros",
			"clockDiscrepancyMicros",
		]) {
			assert.ok(
				Number.isFinite(worker.measurementClock?.[key]) &&
					worker.measurementClock[key] <= 2000,
				`worker clock uncertainty: ${key}`,
			);
		}
	}
	for (const endpoint of [first, last]) {
		assert.ok(endpoint.clockDiscrepancyMicros <= 2000, "host clock jump");
		assert.ok(
			endpoint.epochAfterMicros - endpoint.epochBeforeMicros <= 2000,
			"CPU sampling bracket exceeds 2 ms",
		);
	}
	const start = Math.round((first.epochBeforeMicros + first.epochAfterMicros) / 2);
	const end = Math.round((last.epochBeforeMicros + last.epochAfterMicros) / 2);
	const timestamps = workers.flatMap((worker) => worker[eventKey]);
	const delivered = countInterval(timestamps, start, end);
	const uncertain = timestamps.filter(
		(timestamp) => Math.abs(timestamp - start) <= 2000 || Math.abs(timestamp - end) <= 2000,
	).length;
	assert.ok(delivered > 0 && uncertain / delivered <= 0.01, "material endpoint ambiguity");
	const cpuSeconds = (last.service.cpuTicks - first.service.cpuTicks) / clockTicks;
	assert.ok(cpuSeconds > 0, "missing service CPU observations");
	return {
		schemaVersion: 1,
		eventKey,
		startEpochMicros: start,
		endEpochMicros: end,
		seconds: (end - start) / 1e6,
		delivered,
		endpointUncertainDeliveries: uncertain,
		serviceCpuSeconds: cpuSeconds,
		serviceCpuSecondsPerDeliveredOperation: cpuSeconds / delivered,
	};
}
