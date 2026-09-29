/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { setImmediate as immediate } from "node:timers/promises";
import test from "node:test";
import { pipelinedSummary } from "./benchmark-gates.mjs";
import { pipelinedConfiguration, runPipelinedWorker } from "./benchmark-pipelined.mjs";

const base = {
	backend: "tinylicious",
	loadMode: "pipelined",
	documents: 2,
	payloadBytes: 64,
	warmupSeconds: 1,
	seconds: 1,
	drainTimeoutSeconds: 1,
	maxOutstandingOperations: 4,
	maxOutstandingBytes: 256,
};

/** Advances a synthetic clock only at I/O turns and deadline waits, never by running load. */
async function simulate(overrides = {}, hooks = {}) {
	const connections = [];
	const pending = [];
	const submitted = [];
	let time = 0;
	let turns = 0;
	const context = {
		connections,
		pending,
		submitted,
		get time() {
			return time;
		},
		set time(value) {
			time = value;
		},
		get turns() {
			return turns;
		},
		deliver(operation, recipient) {
			connections[operation.document].receive(recipient, operation.payload);
		},
	};
	const result = await runPipelinedWorker(
		{ ...base, ...overrides },
		{
			now: () => time,
			openPair: async (_configuration, receive, fail) => {
				const document = connections.length;
				const connection = {
					receive,
					fail,
					closed: false,
					submit(sequence, payload) {
						const operation = { document, sequence, payload, time };
						submitted.push(operation);
						if (hooks.submit) hooks.submit(context, operation);
						else pending.push(operation);
					},
					close: async () => {
						connection.closed = true;
						hooks.close?.();
					},
				};
				connections.push(connection);
				return connection;
			},
			ready: async () => {},
			yieldToIO: async () => {
				turns++;
				time += 250;
				if (hooks.yield) hooks.yield(context);
				else {
					for (const operation of pending.splice(0)) {
						context.deliver(operation, 0);
						context.deliver(operation, 1);
					}
				}
				await immediate();
			},
			setTimer: (callback, milliseconds) =>
				setImmediate(() => {
					if (hooks.wait?.(context, milliseconds)) return;
					time += milliseconds;
					callback();
				}),
			clearTimer: clearImmediate,
		},
	);
	assert.ok(connections.every((connection) => connection.closed));
	return { result, ...context };
}

test("pipelined defaults are fixed per-generator logical bounds with explicit semantics", () => {
	const limits = pipelinedConfiguration({
		...base,
		maxOutstandingOperations: undefined,
		maxOutstandingBytes: undefined,
		drainTimeoutSeconds: undefined,
	});
	assert.deepEqual(limits, {
		maxOutstandingOperations: 256,
		maxOutstandingBytes: 2 * 1024 * 1024,
		drainTimeoutSeconds: 30,
		yieldEveryOperations: 64,
		chargeBytesPerOperation: 64,
		windowScope: "generator",
		byteAccounting: "logical-ascii-payload",
		completionSignal: "sequenced-writer-echo",
		transportBackpressure: false,
	});
	for (const patch of [
		{ backend: "sea" },
		{ loadMode: "streamed" },
		{ rate: 100 },
		{ generator: "native" },
		{ transport: "websocket" },
		{ maxOutstandingOperations: 0 },
		{ maxOutstandingOperations: null },
		{ maxOutstandingOperations: 1.5 },
		{ maxOutstandingOperations: Infinity },
		{ maxOutstandingBytes: -1 },
		{ maxOutstandingBytes: null },
		{ maxOutstandingBytes: Number.MAX_SAFE_INTEGER + 1 },
		{ maxOutstandingBytes: 63 },
		{ drainTimeoutSeconds: 0 },
		{ drainTimeoutSeconds: null },
		{ drainTimeoutSeconds: 121 },
		{ payloadBytes: 7 },
	]) {
		assert.throws(() => pipelinedConfiguration({ ...base, ...patch }));
	}
});

test("both operation and byte windows bound a shared, fair multi-document pipeline", async () => {
	for (const [limits, expected] of [
		[{ maxOutstandingOperations: 4, maxOutstandingBytes: 4096 }, 4],
		[{ maxOutstandingOperations: 100, maxOutstandingBytes: 128 }, 2],
		[{ maxOutstandingOperations: 100, maxOutstandingBytes: 191 }, 2],
	]) {
		const { result, submitted } = await simulate(limits);
		assert.deepEqual(result.errors, []);
		assert.equal(result.maxInFlight, expected);
		assert.equal(result.maxOutstandingBytes, expected * 64);
		assert.equal(result.sent, expected * 8);
		assert.equal(result.writerEchoes, result.sent);
		assert.equal(result.missing, 0);
		assert.equal(result.acknowledged, null);
		assert.deepEqual(
			submitted.slice(0, 2).map((operation) => operation.document),
			[0, 1],
		);
		assert.equal(pipelinedSummary([result], 1).writeOperationsPerSecond, expected * 4);
	}
});

test("completion counters include warmup writes, exclude the end boundary, and add readers once", async () => {
	const { result } = await simulate();
	assert.equal(result.sent, 32);
	assert.equal(result.measuredSent, 16);
	assert.equal(result.writerEchoesInWindow, 16);
	assert.equal(result.deliveredInWindow, 16);
	// The batch submitted at 750 ms completes at 1000 ms; the last completes at 2000 ms.
	assert.equal(
		result.readerOutcomes.reduce((sum, reader) => sum + reader.receivedInWindow, 0),
		32,
	);
	assert.deepEqual(pipelinedSummary([result, result], 1), {
		completionSignal: "sequenced-writer-echo",
		writeOperationsPerSecond: 32,
		readOperationsPerSecond: 64,
		losslessDelivery: true,
	});
});

test("writer echoes replenish independently of a delayed observer, which must still drain", async () => {
	const observer = [];
	const { result } = await simulate(
		{},
		{
			yield(context) {
				for (const operation of context.pending.splice(0)) {
					context.deliver(operation, 0);
					observer.push(operation);
				}
			},
			wait(context) {
				context.time += 50;
				for (const operation of observer.splice(0)) context.deliver(operation, 1);
				return true;
			},
		},
	);
	assert.equal(result.sent, 32);
	assert.equal(result.writerEchoesInWindow, 16);
	assert.equal(result.deliveredInWindow, 0);
	assert.equal(result.pendingAtEnd, 32);
	assert.equal(result.outstandingAtEnd, 0);
	assert.equal(result.drainSeconds, 0.05);
	assert.equal(result.missing, 0);
	assert.equal(pipelinedSummary([result], 1).readOperationsPerSecond, 16);
});

test("observer delivery cannot release writer credits; missing writer echoes fail the drain", async () => {
	const { result } = await simulate(
		{},
		{
			yield(context) {
				for (const operation of context.pending.splice(0)) context.deliver(operation, 1);
			},
		},
	);
	assert.equal(result.sent, 4);
	assert.equal(result.windowWaits, 1);
	assert.equal(result.outstandingAtEnd, 4);
	assert.equal(result.outstandingBytesAtEnd, 256);
	assert.equal(result.writerEchoes, 0);
	assert.equal(result.missing, 4);
	assert.equal(result.failures[0].category, "drain-timeout");
	assert.throws(() => pipelinedSummary([result], 1), /worker failure/);
});

test("stalled observers are failures, never shed or allowed to pass exact drain gates", async () => {
	const { result } = await simulate(
		{},
		{
			yield(context) {
				for (const operation of context.pending.splice(0)) context.deliver(operation, 0);
			},
		},
	);
	assert.equal(result.sent, 32);
	assert.equal(result.writerEchoes, result.sent);
	assert.equal(result.missing, result.sent);
	assert.equal(result.failures[0].category, "drain-timeout");
	assert.throws(() => pipelinedSummary([result], 1));
});

test("late delivery cannot pass a drain deadline even if it runs before the timer callback", async () => {
	const { result } = await simulate(
		{},
		{
			yield() {},
			wait(context, milliseconds) {
				// Keep writes pending at the measurement boundary, then deliver too late in drain.
				if (context.time < 2000) return false;
				context.time += milliseconds + 1;
				for (const operation of context.pending.splice(0)) {
					context.deliver(operation, 0);
					context.deliver(operation, 1);
				}
				return true;
			},
		},
	);
	assert.equal(result.missing, 0);
	assert.equal(result.failures[0].category, "drain-timeout");
	assert.throws(() => pipelinedSummary([result], 1));
});

test("synchronous echoes still yield to the event loop after a bounded quantum", async () => {
	const { result, turns } = await simulate(
		{ maxOutstandingOperations: 1000, maxOutstandingBytes: 64000 },
		{
			submit(context, operation) {
				context.deliver(operation, 0);
				context.deliver(operation, 1);
			},
		},
	);
	assert.equal(turns, 8);
	assert.equal(result.sent, 64 * turns);
	assert.equal(result.yields, turns);
	assert.equal(result.maxInFlight, 1);
	assert.equal(result.missing, 0);
});

test("writer delivery during a full-window wait wakes and replenishes the pipeline", async () => {
	const { result } = await simulate(
		{},
		{
			yield() {},
			wait(context) {
				context.time += 100;
				for (const operation of context.pending.splice(0)) {
					context.deliver(operation, 0);
					context.deliver(operation, 1);
				}
				return true;
			},
		},
	);
	assert.ok(result.windowWaits > 0);
	assert.ok(result.sent > 4);
	assert.equal(result.maxInFlight, 4);
	assert.equal(result.missing, 0);
	assert.deepEqual(result.errors, []);
	assert.doesNotThrow(() => pipelinedSummary([result], 1));
});

test("integrity, submit, nack, and disconnect failures retain raw diagnostics and fail gates", async () => {
	for (const category of ["integrity", "submit", "nack", "disconnect"]) {
		const { result } = await simulate(
			{},
			{
				submit(context, operation) {
					const connection = context.connections[operation.document];
					if (category === "integrity") connection.receive(0, "corrupt");
					else if (category === "submit") throw new Error("test submit rejection");
					else connection.fail(new Error(`test ${category}`), category);
				},
			},
		);
		assert.equal(result.sent, 1);
		assert.equal(result.failures[0].category, category);
		assert.ok(result.failures[0].error.length > 0);
		assert.throws(() => pipelinedSummary([result], 1));
	}
	for (const invalid of ["duplicate", "reordered"]) {
		const { result } = await simulate(
			{},
			{
				yield(context) {
					const operations = context.pending.splice(0);
					if (invalid === "duplicate") {
						context.deliver(operations[0], 0);
						context.deliver(operations[0], 0);
					} else context.deliver(operations[2], 0);
				},
			},
		);
		assert.equal(result.failures[0].category, "integrity");
	}
});

test("failed setup and cleanup still return classified results", async () => {
	const result = await runPipelinedWorker(base, {
		openPair: async () => {
			throw new Error("connection setup failed");
		},
		ready: async () => {},
	});
	assert.equal(result.failures[0].category, "setup");
	assert.equal(result.sent, 0);
	assert.throws(() => pipelinedSummary([result], 1));
	const cleanup = await simulate(
		{},
		{
			close() {
				throw new Error("close failed");
			},
		},
	);
	assert.equal(cleanup.result.failures[0].category, "cleanup");
	assert.throws(() => pipelinedSummary([cleanup.result], 1));
});

test("pipelined aggregation rejects inconsistent counters, hidden shedding, and exceeded limits", async () => {
	const { result } = await simulate();
	for (const patch of [
		{ writerEchoes: result.sent - 1 },
		{ writerEchoesInWindow: result.sent + 1 },
		{ writerEchoesInWindow: -1 },
		{ missing: 1 },
		{ maxInFlight: 5 },
		{ maxOutstandingBytes: 257 },
		{ outstandingAfterDrain: 1 },
		{ outstandingAtEnd: 5 },
		{ outstandingBytesAtEnd: 1 },
		{ deliveredInWindow: result.deliveredInWindow - 1 },
		{ acknowledged: result.sent },
		{ drainSeconds: Infinity },
		{ documentCount: 0 },
		{ failures: [{ category: "nack", error: "rejected" }] },
		{ pipeline: { ...result.pipeline, maxOutstandingBytes: 128 } },
	]) {
		assert.throws(() => pipelinedSummary([{ ...result, ...patch }], 1));
	}
	for (const patch of [
		{ receivedInWindow: undefined },
		{ receivedInWindow: result.sent + 1 },
		{ shed: true },
		{ undelivered: 1 },
		{ delivered: result.sent },
	]) {
		const invalid = structuredClone(result);
		Object.assign(invalid.readerOutcomes[0], patch);
		assert.throws(() => pipelinedSummary([invalid], 1));
	}
	const duplicate = structuredClone(result);
	duplicate.readerOutcomes[0] = duplicate.readerOutcomes[1];
	assert.throws(() => pipelinedSummary([duplicate], 1), /duplicate reader/);
	assert.throws(() => pipelinedSummary([], 1));
	assert.throws(() => pipelinedSummary([result], 0));
});
