/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";

/** Parses every listener snapshot without inventing counters absent from older binaries. */
export function transportEvidence(log) {
	const snapshots = [...log.matchAll(/^TRANSPORT_EVIDENCE (.+)$/gm)].map((match) => {
		const snapshot = {};
		for (const field of match[1].trim().split(/\s+/)) {
			const pair = /^([a-z_]+)=(\d+)$/.exec(field);
			assert.ok(pair, `invalid transport evidence: ${field}`);
			const [, name, text] = pair;
			assert.ok(!Object.hasOwn(snapshot, name), `duplicate transport evidence: ${name}`);
			const value = Number(text);
			assert.ok(Number.isSafeInteger(value), `invalid transport counter: ${name}`);
			snapshot[name] = value;
		}
		return snapshot;
	});
	assert.ok(snapshots.length > 0, "missing transport evidence");
	return snapshots;
}

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

/** Requires bounded Tinylicious writer-echo completion and exact independent reader drain. */
export function pipelinedSummary(results, seconds) {
	assert.ok(Number.isFinite(seconds) && seconds > 0);
	assert.ok(results.length > 0, "missing pipelined workers");
	let completed = 0;
	let received = 0;
	for (const entry of results) {
		assert.deepEqual(entry.errors, [], "pipelined worker failure");
		assert.deepEqual(entry.failures, [], "classified pipelined worker failure");
		assert.ok(Number.isSafeInteger(entry.sent) && entry.sent > 0, "missing submissions");
		assert.equal(entry.acknowledged, null, "writer echo is not a durability acknowledgment");
		assert.equal(entry.writerEchoes, entry.sent, "writer echo drain failure");
		assert.equal(entry.missing, 0, "reader drain failure");
		assert.equal(entry.outstandingAfterDrain, 0, "outstanding writes after drain");
		assert.ok(
			Number.isSafeInteger(entry.writerEchoesInWindow) &&
				entry.writerEchoesInWindow >= 0 &&
				entry.writerEchoesInWindow <= entry.writerEchoes,
			"invalid measured writer echoes",
		);
		const limits = entry.pipeline;
		for (const key of [
			"maxOutstandingOperations",
			"maxOutstandingBytes",
			"chargeBytesPerOperation",
		]) {
			assert.ok(Number.isSafeInteger(limits[key]) && limits[key] > 0, key);
		}
		assert.equal(limits.completionSignal, "sequenced-writer-echo");
		assert.equal(limits.transportBackpressure, false);
		assert.equal(limits.windowScope, "generator");
		assert.equal(limits.byteAccounting, "logical-ascii-payload");
		assert.ok(
			Number.isSafeInteger(entry.maxInFlight) &&
				entry.maxInFlight > 0 &&
				entry.maxInFlight <= limits.maxOutstandingOperations,
			"operation window exceeded",
		);
		assert.equal(
			entry.maxOutstandingBytes,
			entry.maxInFlight * limits.chargeBytesPerOperation,
			"inconsistent logical byte charge",
		);
		assert.ok(entry.maxOutstandingBytes <= limits.maxOutstandingBytes, "byte window exceeded");
		assert.ok(
			Number.isSafeInteger(entry.outstandingAtEnd) &&
				entry.outstandingAtEnd >= 0 &&
				entry.outstandingAtEnd <= entry.maxInFlight,
			"invalid end-of-window outstanding count",
		);
		assert.equal(
			entry.outstandingBytesAtEnd,
			entry.outstandingAtEnd * limits.chargeBytesPerOperation,
		);
		assert.ok(Number.isFinite(entry.drainSeconds) && entry.drainSeconds >= 0);
		assert.ok(Number.isInteger(entry.documentCount) && entry.documentCount > 0);
		assert.equal(entry.readerOutcomes.length, 2 * entry.documentCount);
		const identities = new Set();
		const delivered = [0, 0];
		const measured = [0, 0];
		for (const reader of entry.readerOutcomes) {
			assert.ok(
				Number.isInteger(reader.document) &&
					reader.document >= 0 &&
					reader.document < entry.documentCount,
			);
			assert.ok(reader.recipient === 0 || reader.recipient === 1);
			const identity = `${reader.document}:${reader.recipient}`;
			assert.ok(!identities.has(identity), "duplicate reader outcome");
			identities.add(identity);
			assert.equal(reader.shed, false, "pipelined mode does not permit reader shedding");
			assert.equal(reader.undelivered, 0, "reader drain failure");
			assert.ok(Number.isSafeInteger(reader.delivered) && reader.delivered >= 0);
			assert.ok(
				Number.isSafeInteger(reader.receivedInWindow) &&
					reader.receivedInWindow >= 0 &&
					reader.receivedInWindow <= reader.delivered,
				"invalid measured reader deliveries",
			);
			delivered[reader.recipient] += reader.delivered;
			measured[reader.recipient] += reader.receivedInWindow;
			received += reader.receivedInWindow;
		}
		assert.deepEqual(delivered, [entry.sent, entry.sent], "inconsistent reader totals");
		assert.equal(measured[0], entry.writerEchoesInWindow, "inconsistent writer echo totals");
		assert.equal(measured[1], entry.deliveredInWindow, "inconsistent observer totals");
		completed += entry.writerEchoesInWindow;
	}
	assert.ok(completed > 0, "no measured writer echoes");
	return {
		completionSignal: "sequenced-writer-echo",
		writeOperationsPerSecond: completed / seconds,
		readOperationsPerSecond: received / seconds,
		losslessDelivery: true,
	};
}

/** Validates unpaced writes without treating explicitly shed subscriptions as drained readers. */
export function closedLoopSummary(results, seconds, mode = "closed-loop") {
	assert.ok(Number.isFinite(seconds) && seconds > 0);
	assert.ok(["closed-loop", "streamed"].includes(mode));
	let acknowledged = 0;
	let received = 0;
	let hasReadCounts = true;
	let shedReaders = 0;
	let shedMissing = 0;
	for (const entry of results) {
		assert.ok(Number.isSafeInteger(entry.sent) && entry.sent > 0, "missing submissions");
		assert.equal(entry.acknowledged, entry.sent, "acknowledgment drain failure");
		assert.deepEqual(entry.errors, [], "unpaced worker failure");
		assert.ok(
			Number.isSafeInteger(entry.acknowledgedInWindow) &&
				entry.acknowledgedInWindow > 0 &&
				entry.acknowledgedInWindow <= entry.acknowledged,
			"invalid measured acknowledgments",
		);
		assert.ok(
			Number.isSafeInteger(entry.documentCount) &&
				entry.documentCount > 0 &&
				Number.isSafeInteger(entry.maxInFlight) &&
				entry.maxInFlight >= 0 &&
				(mode === "streamed" || entry.maxInFlight <= entry.documentCount),
			"invalid outstanding-write count",
		);
		if (mode === "streamed") {
			assert.equal(entry.transportWritten, entry.sent, "transport write did not finish");
			for (const key of [
				"maxOutstandingBytes",
				"outstandingAtEnd",
				"outstandingBytesAtEnd",
				"pendingTransportWriteCalls",
			]) {
				assert.ok(Number.isSafeInteger(entry[key]) && entry[key] >= 0, key);
			}
			for (const key of ["drainSeconds", "pendingTransportWriteSeconds"]) {
				assert.ok(Number.isFinite(entry[key]) && entry[key] >= 0, key);
			}
		}
		assert.equal(entry.readerOutcomes.length, 2 * entry.documentCount);
		const entryHasReadCounts = entry.readerOutcomes.some(
			(reader) => reader.receivedInWindow !== undefined,
		);
		hasReadCounts &&= entryHasReadCounts;
		const identities = new Set();
		let missing = 0;
		let expectedMissing = 0;
		let totalExpectedDeliveries = 0;
		for (const reader of entry.readerOutcomes) {
			assert.ok(
				Number.isInteger(reader.document) &&
					reader.document >= 0 &&
					reader.document < entry.documentCount,
			);
			assert.ok(reader.recipient === 0 || reader.recipient === 1);
			assert.equal(typeof reader.shed, "boolean");
			const identity = `${reader.document}:${reader.recipient}`;
			assert.ok(!identities.has(identity), "duplicate reader outcome");
			identities.add(identity);
			assert.ok(Number.isSafeInteger(reader.undelivered) && reader.undelivered >= 0);
			assert.ok(Number.isSafeInteger(reader.delivered) && reader.delivered >= 0);
			if (entryHasReadCounts) {
				assert.ok(
					Number.isSafeInteger(reader.receivedInWindow) &&
						reader.receivedInWindow >= 0 &&
						reader.receivedInWindow <= reader.delivered,
					"invalid measured reader deliveries",
				);
				received += reader.receivedInWindow;
			}
			missing += reader.undelivered;
			totalExpectedDeliveries += reader.delivered + reader.undelivered;
			if (reader.shed) {
				shedReaders++;
				expectedMissing += reader.undelivered;
			} else {
				assert.equal(reader.undelivered, 0, "active reader failed to drain");
			}
		}
		assert.equal(entry.missing, missing, "inconsistent delivery totals");
		assert.equal(totalExpectedDeliveries, 2 * entry.sent, "inconsistent reader totals");
		assert.equal(entry.shedMissing, expectedMissing, "inconsistent shed delivery totals");
		assert.equal(missing, expectedMissing, "unexplained missing deliveries");
		acknowledged += entry.acknowledgedInWindow;
		shedMissing += expectedMissing;
	}
	assert.ok(acknowledged > 0, "no measured acknowledgments");
	return {
		acknowledgedOperationsPerSecond: acknowledged / seconds,
		writeOperationsPerSecond: acknowledged / seconds,
		readOperationsPerSecond: hasReadCounts ? received / seconds : null,
		shedReaders,
		shedMissing,
		losslessDelivery: shedReaders === 0 && shedMissing === 0,
	};
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
