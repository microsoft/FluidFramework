/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";

/** Keeps the bounded worker drain open until deliveries and observable acknowledgments finish. */
export function hasPendingDrain(documents, backend) {
	assert.ok(backend === "sea" || backend === "tinylicious", "unknown backend");
	return documents.some(
		(document) =>
			document.observed.some((count) => count !== document.sent) ||
			(backend === "sea" && document.acknowledgments !== document.sent),
	);
}

/** Requires exact delivery for all backends and acknowledgments where the backend exposes them. */
export function assertDrainIntegrity(results, backend) {
	assert.ok(backend === "sea" || backend === "tinylicious", "unknown backend");
	assert.ok(
		results.every(
			(entry) =>
				(backend === "tinylicious" || entry.acknowledged === entry.sent) &&
				entry.missing === 0 &&
				entry.errors.length === 0,
		),
		"exact drain/integrity failure",
	);
}

/** Applies the user-approved p95 repeatability floor without relaxing candidate latency gates. */
export function baselineP95IsStable(values) {
	assert.ok(
		values.length > 0 && values.every((value) => Number.isFinite(value) && value >= 0),
	);
	const minimum = Math.min(...values);
	return Math.max(...values) - minimum <= Math.max(minimum * 0.1, 1);
}

/** Returns the user-approved candidate RSS ceiling in MiB, including allocator retention. */
export function candidateRssLimit(baselineMiB) {
	assert.ok(Number.isFinite(baselineMiB) && baselineMiB >= 0);
	return baselineMiB + Math.max(baselineMiB * 0.2, 32);
}

/** Applies the frozen sample gates; the absolute latency cap is candidate-only. */
export function assertSampleGates(result, side) {
	assert.equal(result.status, "completed", `${side} incomplete run`);
	const offered = result.configuration.rate * result.configuration.seconds;
	assert.ok(
		result.workers.reduce((sum, worker) => sum + worker.measuredSent, 0) >= offered * 0.98,
		`${side} measured submissions below 98%`,
	);
	assert.ok(
		result.workers.reduce((sum, worker) => sum + worker.deliveredInWindow, 0) >=
			offered * 0.98,
		`${side} measured completions below 98%`,
	);
	assert.ok(
		result.workers.every(
			(worker) =>
				Number.isFinite(worker.latencyMilliseconds.p95) &&
				worker.maxScheduleLagMilliseconds <= 100,
		),
		`${side} missing latency or excessive scheduling lag`,
	);
	if (side === "candidate") {
		assert.ok(
			result.workers.every((worker) => worker.latencyMilliseconds.p95 <= 100),
			"candidate absolute p95 latency cap",
		);
	}
	assert.ok(
		result.aligned.delivered >= 0.98 * result.configuration.rate * result.aligned.seconds,
		`${side} aligned in-window completion gate`,
	);
}
