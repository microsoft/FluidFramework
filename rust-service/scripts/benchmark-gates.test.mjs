/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assertDrainIntegrity,
	assertSampleGates,
	baselineP95IsStable,
	candidateRssLimit,
	closedLoopSummary,
	hasPendingDrain,
	transportEvidence,
} from "./benchmark-gates.mjs";

test("transport evidence preserves multiple listeners and missing legacy counters", () => {
	assert.deepEqual(
		transportEvidence(
			"startup\nTRANSPORT_EVIDENCE wire_bytes=12\nTRANSPORT_EVIDENCE wire_bytes=99 peak_pending_author_requests=128 peak_pending_author_bytes=8192\n",
		),
		[
			{ wire_bytes: 12 },
			{ wire_bytes: 99, peak_pending_author_requests: 128, peak_pending_author_bytes: 8192 },
		],
	);
	for (const log of [
		"startup only",
		"TRANSPORT_EVIDENCE wire_bytes=-1",
		"TRANSPORT_EVIDENCE wire_bytes=NaN",
		"TRANSPORT_EVIDENCE wire_bytes=999999999999999999999",
		"TRANSPORT_EVIDENCE wire_bytes=1 wire_bytes=2",
	]) {
		assert.throws(() => transportEvidence(log));
	}
});

test("closed-loop throughput counts acknowledgments and reports explicit shedding separately", () => {
	const result = {
		sent: 10,
		acknowledged: 10,
		acknowledgedInWindow: 8,
		documentCount: 1,
		errors: [],
		maxInFlight: 1,
		missing: 0,
		shedMissing: 0,
		readerOutcomes: [
			{
				document: 0,
				recipient: 0,
				shed: false,
				delivered: 10,
				undelivered: 0,
				receivedInWindow: 7,
			},
			{
				document: 0,
				recipient: 1,
				shed: false,
				delivered: 10,
				undelivered: 0,
				receivedInWindow: 6,
			},
		],
	};
	assert.deepEqual(closedLoopSummary([result], 2), {
		acknowledgedOperationsPerSecond: 4,
		writeOperationsPerSecond: 4,
		readOperationsPerSecond: 6.5,
		shedReaders: 0,
		shedMissing: 0,
		losslessDelivery: true,
	});
	assert.equal(closedLoopSummary([result, result], 2).readOperationsPerSecond, 13);
	assert.equal(closedLoopSummary([result, result], 2).writeOperationsPerSecond, 8);
	const legacy = structuredClone(result);
	for (const reader of legacy.readerOutcomes) delete reader.receivedInWindow;
	assert.equal(closedLoopSummary([legacy], 2).readOperationsPerSecond, null);
	assert.equal(closedLoopSummary([legacy, result], 2).readOperationsPerSecond, null);
	const zeroReads = structuredClone(result);
	for (const reader of zeroReads.readerOutcomes) reader.receivedInWindow = 0;
	assert.equal(closedLoopSummary([zeroReads], 2).readOperationsPerSecond, 0);
	for (const count of [-1, 11, 0.5, NaN, undefined]) {
		const invalid = structuredClone(result);
		invalid.readerOutcomes[0].receivedInWindow = count;
		assert.throws(() => closedLoopSummary([invalid], 2), /invalid measured reader deliveries/);
	}
	for (const patch of [
		{ acknowledged: 9 },
		{ acknowledgedInWindow: 11 },
		{ maxInFlight: 2 },
		{ errors: ["rejected write"] },
		{ missing: 1 },
		{ shedMissing: 1 },
		{ readerOutcomes: [result.readerOutcomes[0], result.readerOutcomes[0]] },
	]) {
		assert.throws(() => closedLoopSummary([{ ...result, ...patch }], 2));
	}
	result.readerOutcomes[1] = {
		document: 0,
		recipient: 1,
		shed: true,
		delivered: 3,
		undelivered: 7,
		receivedInWindow: 2,
	};
	result.missing = result.shedMissing = 7;
	assert.deepEqual(closedLoopSummary([result], 2), {
		acknowledgedOperationsPerSecond: 4,
		writeOperationsPerSecond: 4,
		readOperationsPerSecond: 4.5,
		shedReaders: 1,
		shedMissing: 7,
		losslessDelivery: false,
	});
	result.readerOutcomes[1].shed = false;
	assert.throws(() => closedLoopSummary([result], 2), /active reader failed to drain/);
	assert.throws(() => closedLoopSummary([], 2), /no measured acknowledgments/);
});

test("streamed throughput permits pipelining but requires complete transport, receipt, and reader drain", () => {
	const result = {
		sent: 20000,
		transportWritten: 20000,
		acknowledged: 20000,
		acknowledgedInWindow: 10000,
		documentCount: 1,
		errors: [],
		maxInFlight: 17700,
		maxOutstandingBytes: 1256700,
		outstandingAtEnd: 12000,
		outstandingBytesAtEnd: 852000,
		pendingTransportWriteCalls: 2,
		pendingTransportWriteSeconds: 3.5,
		drainSeconds: 4,
		missing: 0,
		shedMissing: 0,
		readerOutcomes: [0, 1].map((recipient) => ({
			document: 0,
			recipient,
			shed: false,
			delivered: 20000,
			undelivered: 0,
		})),
	};
	assert.deepEqual(closedLoopSummary([result], 2, "streamed"), {
		acknowledgedOperationsPerSecond: 5000,
		writeOperationsPerSecond: 5000,
		readOperationsPerSecond: null,
		shedReaders: 0,
		shedMissing: 0,
		losslessDelivery: true,
	});
	assert.throws(() => closedLoopSummary([result], 2), /outstanding-write count/);
	for (const patch of [
		{ transportWritten: 19999 },
		{ acknowledged: 19999 },
		{ errors: ["streamed workload did not drain within 30 seconds"] },
		{ maxOutstandingBytes: -1 },
		{ outstandingAtEnd: null },
		{ outstandingBytesAtEnd: null },
		{ pendingTransportWriteCalls: 0.5 },
		{ pendingTransportWriteSeconds: Infinity },
		{ drainSeconds: -1 },
	]) {
		assert.throws(() => closedLoopSummary([{ ...result, ...patch }], 2, "streamed"));
	}
});

test("Sea drain waits for an acknowledgment that follows the final deliveries", async () => {
	const document = { sent: 1, observed: [0, 0], acknowledgments: 0 };
	assert.equal(hasPendingDrain([document], "sea"), true);
	document.observed = [1, 1];
	let acknowledge;
	const pending = new Promise((resolve) => {
		acknowledge = resolve;
	}).then(() => {
		document.acknowledgments++;
	});
	assert.equal(hasPendingDrain([document], "sea"), true);
	assert.equal(hasPendingDrain([document], "tinylicious"), false);
	acknowledge();
	await pending;
	assert.equal(hasPendingDrain([document], "sea"), false);
	document.observed[1] = 0;
	assert.equal(hasPendingDrain([document], "sea"), true);
	assert.equal(hasPendingDrain([document], "tinylicious"), true);
});

test("drain integrity preserves Tinylicious's unavailable acknowledgment observation", () => {
	const result = { sent: 10, acknowledged: null, missing: 0, errors: [] };
	assert.doesNotThrow(() => assertDrainIntegrity([result], "tinylicious"));
	assert.throws(() => assertDrainIntegrity([result], "sea"), /integrity/);
	assert.throws(
		() => assertDrainIntegrity([{ ...result, acknowledged: 9 }], "sea"),
		/integrity/,
	);
	assert.doesNotThrow(() => assertDrainIntegrity([{ ...result, acknowledged: 10 }], "sea"));
	for (const backend of ["sea", "tinylicious"]) {
		assert.throws(
			() => assertDrainIntegrity([{ ...result, acknowledged: 10, missing: 1 }], backend),
			/integrity/,
		);
		assert.throws(
			() =>
				assertDrainIntegrity([{ ...result, acknowledged: 10, errors: ["corrupt"] }], backend),
			/integrity/,
		);
	}
});

test("candidate RSS allowance is twenty percent or thirty-two MiB", () => {
	assert.equal(candidateRssLimit(100), 132);
	assert.equal(candidateRssLimit(200), 240);
	assert.equal(candidateRssLimit(154.546875), 186.546875);
	assert.throws(() => candidateRssLimit(Number.NaN));
});

test("baseline p95 repeatability allows at most ten percent or one millisecond", () => {
	assert.equal(baselineP95IsStable([2.236127, 2.512874, 2.508116]), true);
	assert.equal(baselineP95IsStable([15.16999, 77.884199, 16.795697]), false);
	assert.equal(baselineP95IsStable([20, 22]), true);
	assert.equal(baselineP95IsStable([20, 22.1]), false);
	assert.equal(baselineP95IsStable([2, 3]), true);
	assert.equal(baselineP95IsStable([2, 3.1]), false);
	assert.throws(() => baselineP95IsStable([Number.NaN]));
});

test("the frozen absolute latency cap applies to candidates, not baselines", () => {
	const result = {
		status: "completed",
		configuration: { rate: 1000, seconds: 10 },
		workers: [
			{
				measuredSent: 10000,
				deliveredInWindow: 10000,
				latencyMilliseconds: { p95: 110 },
				maxScheduleLagMilliseconds: 10,
			},
		],
		aligned: { delivered: 9900, seconds: 9.9 },
	};
	assert.doesNotThrow(() => assertSampleGates(result, "baseline"));
	assert.throws(() => assertSampleGates(result, "candidate"), /absolute p95/);
	result.workers[0].maxScheduleLagMilliseconds = 101;
	assert.throws(() => assertSampleGates(result, "baseline"), /scheduling lag/);
});
