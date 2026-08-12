/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ISequencedDocumentMessage,
	IStream,
	IStreamResult,
} from "@fluidframework/driver-definitions/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { generateBatchId, type InboundMessageResult } from "../../opLifecycle/index.js";
import type { InboundSequencedContainerRuntimeMessage } from "../../messageTypes.js";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	VersionMarkResolver,
	type IHistoricalOpReader,
	// eslint-disable-next-line import-x/no-internal-modules -- test imports the resolver module directly
} from "../../versionMarks/versionMarkResolver.js";

/**
 * Builds (enough of) an `ISequencedDocumentMessage` for the resolver's batch matching. The resolver
 * only reads `sequenceNumber`, `clientId`, `clientSequenceNumber`, and the batch `metadata`
 * (`batchId` on resubmit, `batch: true|false` marking a multi-op batch's first/last op).
 */
function makeOp(fields: {
	sequenceNumber: number;
	// eslint-disable-next-line @rushstack/no-new-null -- mirrors ISequencedDocumentMessage.clientId (string | null) for server-generated ops
	clientId?: string | null;
	clientSequenceNumber?: number;
	metadata?: { batchId?: string; batch?: boolean };
}): ISequencedDocumentMessage {
	return {
		// eslint-disable-next-line unicorn/no-null -- default clientId mirrors the legacy string | null shape the resolver guards against
		clientId: null,
		clientSequenceNumber: 0,
		...fields,
	} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage;
}

/** Turns an array of op chunks (one per `read()`) into an `IStream`. */
function makeStream(
	chunks: ISequencedDocumentMessage[][],
): IStream<ISequencedDocumentMessage[]> {
	let index = 0;
	return {
		async read(): Promise<IStreamResult<ISequencedDocumentMessage[]>> {
			if (index < chunks.length) {
				return { done: false, value: chunks[index++] };
			}
			return { done: true };
		},
	};
}

/** A historical op reader over fixed chunks that records the `from`/`to` it was called with. */
function makeReader(
	chunks: ISequencedDocumentMessage[][],
	calls: { from: number; to?: number }[] = [],
): IHistoricalOpReader {
	return {
		async fetchMessages(from, to): Promise<IStream<ISequencedDocumentMessage[]>> {
			calls.push({ from, to });
			return makeStream(chunks);
		},
	};
}

function makeResolver(options?: {
	reader?: IHistoricalOpReader;
	currentSequenceNumber?: number;
	currentMinimumSequenceNumber?: () => number;
	currentPendingBatchId?: string;
	onFlush?: () => void;
	logger?: MockLogger;
	unpackerFactory?: () => (op: ISequencedDocumentMessage) => InboundMessageResult | undefined;
}): VersionMarkResolver {
	return new VersionMarkResolver({
		getCurrentSequenceNumber: () => options?.currentSequenceNumber ?? 0,
		getCurrentMinimumSequenceNumber: () => options?.currentMinimumSequenceNumber?.() ?? 0,
		getCurrentPendingBatchId: () => options?.currentPendingBatchId,
		flushPendingBatch: () => options?.onFlush?.(),
		logger: (options?.logger ?? new MockLogger()).toTelemetryLogger(),
		getHistoricalOpReader: options?.reader === undefined ? undefined : () => options.reader,
		// The container injects the real inbound unpack pipeline; tests use a stand-in (see makeUnpacker).
		createHistoricalOpUnpacker:
			options?.reader === undefined ? undefined : (options?.unpackerFactory ?? makeUnpacker),
	});
}

/**
 * Stand-in for the runtime's inbound unpack pipeline: maps a raw op (with batch metadata) to the same
 * `InboundMessageResult` the live path produces, tracking multi-op batch progress across the scan. The
 * resolver reuses `inboundVersionMarkUpdate` on these, so this exercises the real batch-identity path.
 * A fresh instance is created per scan (it holds `batchInProgress` state).
 */
/** Contextually types an object literal as an `InboundMessageResult` without a type assertion. */
function inboundResult(result: InboundMessageResult): InboundMessageResult {
	return result;
}

function makeUnpacker(): (op: ISequencedDocumentMessage) => InboundMessageResult | undefined {
	let batchInProgress = false;
	return (op) => {
		const metadata = op.metadata as { batchId?: string; batch?: boolean } | undefined;
		const message = op as unknown as InboundSequencedContainerRuntimeMessage;
		if (!batchInProgress) {
			const batchStart = {
				batchId: metadata?.batchId,
				clientId: op.clientId as string,
				batchStartCsn: op.clientSequenceNumber,
				keyMessage: op,
			};
			if (metadata?.batch === true) {
				batchInProgress = true;
				return inboundResult({
					type: "batchStartingMessage",
					batchStart,
					nextMessage: message,
				});
			}
			return inboundResult({
				type: "fullBatch",
				messages: [message],
				batchStart,
				length: 1,
				groupedBatch: false,
			});
		}
		if (metadata?.batch === false) {
			batchInProgress = false;
			return inboundResult({ type: "nextBatchMessage", nextMessage: message, batchEnd: true });
		}
		return inboundResult({ type: "nextBatchMessage", nextMessage: message, batchEnd: false });
	};
}

/**
 * Wraps {@link makeUnpacker}, recording the sequence number of every op actually fed to the unpacker.
 * Lets a test assert that the scan drops an orphan batch-end marker (never handing it to the unpacker,
 * which the real `RemoteMessageProcessor` would reject with an assert).
 */
function makeRecordingUnpackerFactory(
	fed: number[],
): () => (op: ISequencedDocumentMessage) => InboundMessageResult | undefined {
	return () => {
		const inner = makeUnpacker();
		return (op) => {
			fed.push(op.sequenceNumber);
			return inner(op);
		};
	};
}

describe("VersionMarkResolver", () => {
	describe("sealAndCaptureVersionMark", () => {
		it("returns a pending capture with the pending batchId and sequence number lower bound", () => {
			const resolver = makeResolver({
				currentSequenceNumber: 42,
				currentPendingBatchId: "client_[3]",
			});
			assert.deepEqual(resolver.sealAndCaptureVersionMark(), {
				kind: "pending",
				batchId: "client_[3]",
				sequenceNumberLowerBound: 42,
			});
		});

		it("returns a resolved capture at the current sequence number when nothing is pending", () => {
			const resolver = makeResolver({ currentSequenceNumber: 42 });
			assert.deepEqual(resolver.sealAndCaptureVersionMark(), {
				kind: "resolved",
				sequenceNumber: 42,
			});
		});

		it("flushes the current batch before reading, so a just-submitted edit's batchId is captured", () => {
			// Before flush there is no pending batch; the flush "seals" it and assigns the batchId. Capture
			// must flush first, so it observes the sealed batch rather than the pre-flush undefined.
			let pendingBatchId: string | undefined;
			const resolver = new VersionMarkResolver({
				getCurrentSequenceNumber: () => 100,
				getCurrentMinimumSequenceNumber: () => 0,
				getCurrentPendingBatchId: () => pendingBatchId,
				flushPendingBatch: () => {
					pendingBatchId = "client_[9]";
				},
				logger: new MockLogger().toTelemetryLogger(),
			});
			assert.deepEqual(resolver.sealAndCaptureVersionMark(), {
				kind: "pending",
				batchId: "client_[9]",
				sequenceNumberLowerBound: 100,
			});
		});
	});

	describe("tracking gate (isTracking)", () => {
		it("does not track until the feature is used", () => {
			const resolver = makeResolver();
			assert.equal(resolver.isTracking, false);
		});

		it("starts tracking after a pending capture", () => {
			const resolver = makeResolver({ currentPendingBatchId: "client_[3]" });
			assert.equal(resolver.isTracking, false);
			resolver.sealAndCaptureVersionMark();
			assert.equal(resolver.isTracking, true);
		});

		it("does not start tracking after a resolved capture (nothing to promote)", () => {
			const resolver = makeResolver();
			resolver.sealAndCaptureVersionMark();
			assert.equal(resolver.isTracking, false);
		});

		it("starts tracking after a listener subscribes", () => {
			const resolver = makeResolver();
			resolver.onBatchSequenced(() => {});
			assert.equal(resolver.isTracking, true);
		});
	});

	describe("resolve - in-session fast path", () => {
		it("resolves a batch seen live this session from the ephemeral map", async () => {
			const resolver = makeResolver();
			resolver.processInboundBatch("client_[5]", 12);
			assert.deepEqual(await resolver.resolve("client_[5]", 0), {
				kind: "resolved",
				sequenceNumber: 12,
			});
		});

		it("prefers the live map over a history read (reader is not consulted)", async () => {
			const calls: { from: number; to?: number }[] = [];
			const reader = makeReader([], calls);
			const resolver = makeResolver({ reader });
			resolver.processInboundBatch("client_[5]", 12);

			assert.deepEqual(await resolver.resolve("client_[5]", 999), {
				kind: "resolved",
				sequenceNumber: 12,
			});
			assert.equal(calls.length, 0, "history reader should not be called on a live-map hit");
		});
	});

	describe("resolve - no reader wired", () => {
		it("reports an unknown batchId as pending when no reader is available", async () => {
			const resolver = makeResolver();
			assert.deepEqual(await resolver.resolve("missing_[1]", 0), { kind: "pending" });
		});
	});

	describe("resolveFromHistory - single-op batches", () => {
		it("resolves a fresh-submit single-op batch by its derived identity", async () => {
			const batchId = generateBatchId("clientA", 7);
			const reader = makeReader([
				[makeOp({ sequenceNumber: 12, clientId: "clientA", clientSequenceNumber: 7 })],
			]);
			const resolver = makeResolver({ reader });
			assert.deepEqual(await resolver.resolve(batchId, 0), {
				kind: "resolved",
				sequenceNumber: 12,
			});
		});

		it("resolves a resubmitted single-op batch by its explicit batchId metadata", async () => {
			const reader = makeReader([
				[
					makeOp({
						sequenceNumber: 20,
						clientId: "resubmitter",
						clientSequenceNumber: 99,
						metadata: { batchId: "original_[3]" },
					}),
				],
			]);
			const resolver = makeResolver({ reader });
			assert.deepEqual(await resolver.resolve("original_[3]", 0), {
				kind: "resolved",
				sequenceNumber: 20,
			});
		});

		it("skips leading non-matching ops before the target", async () => {
			const reader = makeReader([
				[
					makeOp({ sequenceNumber: 10, clientId: "other", clientSequenceNumber: 1 }),
					makeOp({ sequenceNumber: 11, clientId: "clientA", clientSequenceNumber: 7 }),
				],
			]);
			const resolver = makeResolver({ reader });
			assert.deepEqual(await resolver.resolve(generateBatchId("clientA", 7), 0), {
				kind: "resolved",
				sequenceNumber: 11,
			});
		});
	});

	describe("resolveFromHistory - multi-op batches", () => {
		it("returns the last op's sequence number for a multi-op batch", async () => {
			const reader = makeReader([
				[
					makeOp({
						sequenceNumber: 30,
						clientId: "clientB",
						clientSequenceNumber: 4,
						metadata: { batch: true },
					}),
					makeOp({ sequenceNumber: 31, clientId: "clientB", clientSequenceNumber: 5 }),
					makeOp({
						sequenceNumber: 32,
						clientId: "clientB",
						clientSequenceNumber: 6,
						metadata: { batch: false },
					}),
				],
			]);
			const resolver = makeResolver({ reader });
			assert.deepEqual(await resolver.resolve(generateBatchId("clientB", 4), 0), {
				kind: "resolved",
				sequenceNumber: 32,
			});
		});

		it("resolves a multi-op batch identified by an explicit batchId on its first op", async () => {
			const reader = makeReader([
				[
					makeOp({
						sequenceNumber: 40,
						clientId: "resubmitter",
						clientSequenceNumber: 1,
						metadata: { batchId: "original_[2]", batch: true },
					}),
					makeOp({
						sequenceNumber: 41,
						clientId: "resubmitter",
						clientSequenceNumber: 2,
						metadata: { batch: false },
					}),
				],
			]);
			const resolver = makeResolver({ reader });
			assert.deepEqual(await resolver.resolve("original_[2]", 0), {
				kind: "resolved",
				sequenceNumber: 41,
			});
		});

		it("tracks batch membership across a read() boundary", async () => {
			const reader = makeReader([
				[
					makeOp({
						sequenceNumber: 50,
						clientId: "clientC",
						clientSequenceNumber: 8,
						metadata: { batch: true },
					}),
				],
				[
					makeOp({
						sequenceNumber: 51,
						clientId: "clientC",
						clientSequenceNumber: 9,
						metadata: { batch: false },
					}),
				],
			]);
			const resolver = makeResolver({ reader });
			assert.deepEqual(await resolver.resolve(generateBatchId("clientC", 8), 0), {
				kind: "resolved",
				sequenceNumber: 51,
			});
		});
	});

	describe("resolveFromHistory - chunked batches (unpack pipeline)", () => {
		it("resolves a chunked batch whose batchId is only restored after reassembly", async () => {
			// On the wire, a chunked batch's final chunk carries NO batchId in its metadata (it is stripped
			// and restored only after OpSplitter reassembly). These ops therefore have no batch metadata, so
			// the old inline metadata scan would miss them. The unpack pipeline reassembles the batch and
			// surfaces its restored batchId on the final chunk's op (seq 62).
			const reader = makeReader([
				[
					makeOp({ sequenceNumber: 60, clientId: "chunker", clientSequenceNumber: 1 }),
					makeOp({ sequenceNumber: 61, clientId: "chunker", clientSequenceNumber: 1 }),
					makeOp({ sequenceNumber: 62, clientId: "chunker", clientSequenceNumber: 1 }),
				],
			]);
			// Reassembly stand-in: the first two chunks yield nothing; the final chunk yields the
			// reassembled full batch with its restored batchId.
			const unpackerFactory = (): ((
				op: ISequencedDocumentMessage,
			) => InboundMessageResult | undefined) => {
				let chunksSeen = 0;
				return (op) => {
					chunksSeen += 1;
					if (chunksSeen < 3) {
						return undefined; // incomplete chunk awaiting more fragments
					}
					const result: InboundMessageResult = {
						type: "fullBatch",
						messages: [op as unknown as InboundSequencedContainerRuntimeMessage],
						batchStart: {
							batchId: "chunked_[4]",
							clientId: op.clientId as string,
							batchStartCsn: op.clientSequenceNumber,
							keyMessage: op,
						},
						length: 1,
						groupedBatch: false,
					};
					return result;
				};
			};
			const resolver = makeResolver({ reader, unpackerFactory });
			assert.deepEqual(await resolver.resolve("chunked_[4]", 0), {
				kind: "resolved",
				sequenceNumber: 62,
			});
		});
	});

	describe("resolveFromHistory - mid-batch scan anchor (clipped leading batch)", () => {
		it("tolerates an anchor landing on the end op of a prior multi-op batch", async () => {
			// First fetched op (seq 12) is the END marker of a batch clipped by the scan start. The real
			// unpacker's processor would assert on it, so the scan must drop it (never feed it) and go on
			// to find the target.
			const reader = makeReader([
				[
					makeOp({
						sequenceNumber: 12,
						clientId: "clipped",
						clientSequenceNumber: 6,
						metadata: { batch: false },
					}),
					makeOp({
						sequenceNumber: 13,
						clientId: "target",
						clientSequenceNumber: 1,
						metadata: { batch: true },
					}),
					makeOp({ sequenceNumber: 14, clientId: "target", clientSequenceNumber: 2 }),
					makeOp({
						sequenceNumber: 15,
						clientId: "target",
						clientSequenceNumber: 3,
						metadata: { batch: false },
					}),
				],
			]);
			const fed: number[] = [];
			const resolver = makeResolver({
				reader,
				unpackerFactory: makeRecordingUnpackerFactory(fed),
			});
			assert.deepEqual(await resolver.resolve(generateBatchId("target", 1), 0), {
				kind: "resolved",
				sequenceNumber: 15,
			});
			assert.ok(
				!fed.includes(12),
				"the clipped batch's orphan end marker must not reach the unpacker",
			);
		});

		it("tolerates an anchor landing on a middle op of a prior multi-op batch", async () => {
			// Scan starts on a MIDDLE op (seq 11) of the clipped batch, then its end marker (seq 12). The
			// middle op reads as a lone batch (id can't match the target); the orphan end (seq 12) is dropped.
			const reader = makeReader([
				[
					makeOp({ sequenceNumber: 11, clientId: "clipped", clientSequenceNumber: 5 }),
					makeOp({
						sequenceNumber: 12,
						clientId: "clipped",
						clientSequenceNumber: 6,
						metadata: { batch: false },
					}),
					makeOp({
						sequenceNumber: 13,
						clientId: "target",
						clientSequenceNumber: 1,
						metadata: { batch: true },
					}),
					makeOp({
						sequenceNumber: 14,
						clientId: "target",
						clientSequenceNumber: 2,
						metadata: { batch: false },
					}),
				],
			]);
			const fed: number[] = [];
			const resolver = makeResolver({
				reader,
				unpackerFactory: makeRecordingUnpackerFactory(fed),
			});
			assert.deepEqual(await resolver.resolve(generateBatchId("target", 1), 0), {
				kind: "resolved",
				sequenceNumber: 14,
			});
			assert.ok(
				!fed.includes(12),
				"the clipped batch's orphan end marker must not reach the unpacker",
			);
		});
	});

	describe("resolveFromHistory - not found: pending vs unresolvable", () => {
		it("unresolvable when a trim gap sits at the anchor (first op past `from`)", async () => {
			// from = 1, but the earliest available op is 10 → [1, 10) was trimmed, taking the mark's batch.
			const reader = makeReader([
				[makeOp({ sequenceNumber: 10, clientId: "other", clientSequenceNumber: 1 })],
			]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 12 });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 0), {
				kind: "unresolvable",
			});
		});

		it("unresolvable when the range was trimmed (empty read despite sequenced ops)", async () => {
			// tip (20) is well past `from` (1), so ops should exist; an empty read means the range was trimmed.
			const reader = makeReader([]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 20 });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 0), {
				kind: "unresolvable",
			});
		});

		it("pending when ops are present from the anchor but the batch is not yet sequenced", async () => {
			// from = 6 and the read starts exactly at 6 (no trim gap); the batch simply is not there yet.
			const reader = makeReader([
				[
					makeOp({ sequenceNumber: 6, clientId: "other", clientSequenceNumber: 1 }),
					makeOp({ sequenceNumber: 7, clientId: "other", clientSequenceNumber: 2 }),
				],
			]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 7 });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 5), {
				kind: "pending",
			});
		});

		it("pending when nothing has sequenced past the reference point", async () => {
			// tip (5) == sequenceNumberLowerBound, so `from` (6) is beyond the tip: the batch cannot have landed.
			const reader = makeReader([]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 5 });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 5), {
				kind: "pending",
			});
		});

		it("reads from sequenceNumberLowerBound + 1 (the exclusive lower-bound anchor)", async () => {
			const calls: { from: number; to?: number }[] = [];
			const reader = makeReader([], calls);
			const resolver = makeResolver({ reader });
			await resolver.resolve(generateBatchId("missing", 9), 10);
			assert.deepEqual(calls, [{ from: 11, to: undefined }]);
		});

		it("asserts when the reader returns an op before the requested range start", async () => {
			// The trim inference relies on the reader never returning an op earlier than `from`. A reader
			// that violates this (returns seq 5 when from = 11) must fail loudly, not silently misclassify.
			const reader = makeReader([
				[makeOp({ sequenceNumber: 5, clientId: "other", clientSequenceNumber: 1 })],
			]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 20 });
			await assert.rejects(
				async () => resolver.resolve(generateBatchId("missing", 9), 10),
				validateAssertionError(/before the requested range start/),
			);
		});
	});

	describe("resolveFromHistory - abort", () => {
		it("aborts the in-flight fetch once it resolves the batch", async () => {
			let capturedSignal: AbortSignal | undefined;
			const reader: IHistoricalOpReader = {
				async fetchMessages(
					_from,
					_to,
					abortSignal,
				): Promise<IStream<ISequencedDocumentMessage[]>> {
					capturedSignal = abortSignal;
					return makeStream([
						[makeOp({ sequenceNumber: 12, clientId: "clientA", clientSequenceNumber: 7 })],
					]);
				},
			};
			const resolver = makeResolver({ reader });
			await resolver.resolve(generateBatchId("clientA", 7), 0);
			assert.equal(capturedSignal?.aborted, true, "fetch should be aborted after resolving");
		});

		it("aborts the in-flight fetch when the batch is not found", async () => {
			let capturedSignal: AbortSignal | undefined;
			const reader: IHistoricalOpReader = {
				async fetchMessages(
					_from,
					_to,
					abortSignal,
				): Promise<IStream<ISequencedDocumentMessage[]>> {
					capturedSignal = abortSignal;
					return makeStream([
						[makeOp({ sequenceNumber: 10, clientId: "other", clientSequenceNumber: 1 })],
					]);
				},
			};
			const resolver = makeResolver({ reader });
			await resolver.resolve(generateBatchId("missing", 9), 0);
			assert.equal(
				capturedSignal?.aborted,
				true,
				"fetch should be aborted after exhausting the range",
			);
		});
	});

	describe("onBatchSequenced / processInboundBatch", () => {
		it("notifies subscribers as batches are processed", () => {
			const resolver = makeResolver();
			const events: [string, number][] = [];
			resolver.onBatchSequenced((batchId, sequenceNumber) =>
				events.push([batchId, sequenceNumber]),
			);
			resolver.processInboundBatch("client_[1]", 5);
			resolver.processInboundBatch("client_[2]", 6);
			assert.deepEqual(events, [
				["client_[1]", 5],
				["client_[2]", 6],
			]);
		});

		it("stops notifying after unsubscribe", () => {
			const resolver = makeResolver();
			const events: [string, number][] = [];
			const unsubscribe = resolver.onBatchSequenced((batchId, sequenceNumber) =>
				events.push([batchId, sequenceNumber]),
			);
			resolver.processInboundBatch("client_[1]", 5);
			unsubscribe();
			resolver.processInboundBatch("client_[2]", 6);
			assert.deepEqual(events, [["client_[1]", 5]]);
		});

		it("does not re-notify when the same batchId maps to the same sequence number", () => {
			const resolver = makeResolver();
			const events: [string, number][] = [];
			resolver.onBatchSequenced((batchId, sequenceNumber) =>
				events.push([batchId, sequenceNumber]),
			);
			resolver.processInboundBatch("client_[1]", 5);
			resolver.processInboundBatch("client_[1]", 5);
			assert.deepEqual(events, [["client_[1]", 5]]);
		});

		it("makes a processed batch resolvable via the live fast path", async () => {
			const resolver = makeResolver();
			resolver.processInboundBatch("client_[7]", 21);
			assert.deepEqual(await resolver.resolve("client_[7]", 0), {
				kind: "resolved",
				sequenceNumber: 21,
			});
		});

		it("isolates a throwing listener: it neither aborts processing nor starves other listeners", async () => {
			const logger = new MockLogger();
			const resolver = makeResolver({ logger });
			const before: [string, number][] = [];
			const after: [string, number][] = [];
			resolver.onBatchSequenced((batchId, sequenceNumber) =>
				before.push([batchId, sequenceNumber]),
			);
			resolver.onBatchSequenced(() => {
				throw new Error("subscriber boom");
			});
			resolver.onBatchSequenced((batchId, sequenceNumber) =>
				after.push([batchId, sequenceNumber]),
			);

			// A throwing listener must not propagate out of processInboundBatch (which runs on the inbound op path).
			assert.doesNotThrow(() => resolver.processInboundBatch("client_[1]", 5));
			// Listeners registered both before and after the throwing one still fire.
			assert.deepEqual(before, [["client_[1]", 5]]);
			assert.deepEqual(after, [["client_[1]", 5]]);
			// The fault is logged rather than swallowed.
			logger.assertMatch([{ eventName: "VersionMarkListenerException", category: "error" }]);
			// The batch is still recorded despite the fault, so it resolves via the live fast path.
			assert.deepEqual(await resolver.resolve("client_[1]", 0), {
				kind: "resolved",
				sequenceNumber: 5,
			});
		});
	});

	describe("fast-path map eviction (MSN)", () => {
		it("evicts entries below the minimum sequence number, keeping those at or above it", async () => {
			let minimumSequenceNumber = 0;
			const resolver = makeResolver({
				currentMinimumSequenceNumber: () => minimumSequenceNumber,
				// No reader, so an evicted (fast-path miss) batch reports pending rather than scanning.
			});
			resolver.processInboundBatch("a_[1]", 5);
			resolver.processInboundBatch("b_[2]", 10);
			assert.deepEqual(await resolver.resolve("a_[1]", 0), {
				kind: "resolved",
				sequenceNumber: 5,
			});

			// Advancing the MSN past seq 5 evicts a_[1] on the next inbound batch; b_[2] (seq 10) is retained.
			minimumSequenceNumber = 8;
			resolver.processInboundBatch("c_[3]", 12);

			assert.deepEqual(await resolver.resolve("a_[1]", 0), { kind: "pending" });
			assert.deepEqual(await resolver.resolve("b_[2]", 0), {
				kind: "resolved",
				sequenceNumber: 10,
			});
			assert.deepEqual(await resolver.resolve("c_[3]", 0), {
				kind: "resolved",
				sequenceNumber: 12,
			});
		});

		it("never evicts the just-recorded batch (its seq is at or above the MSN)", async () => {
			const resolver = makeResolver({ currentMinimumSequenceNumber: () => 100 });
			resolver.processInboundBatch("recent_[1]", 100);
			assert.deepEqual(await resolver.resolve("recent_[1]", 0), {
				kind: "resolved",
				sequenceNumber: 100,
			});
		});
	});
});
