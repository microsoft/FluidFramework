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
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import type { InboundSequencedContainerRuntimeMessage } from "../../messageTypes.js";
import { ContainerMessageType } from "../../messageTypes.js";
import {
	generateBatchId,
	tryGetDeserializedRuntimeOpCopy,
	OpDecompressor,
	OpGroupingManager,
	OpSplitter,
	type InboundMessageResult,
	RemoteMessageProcessor,
} from "../../opLifecycle/index.js";
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
	timestamp?: number;
	// eslint-disable-next-line @rushstack/no-new-null -- mirrors ISequencedDocumentMessage.clientId (string | null) for server-generated ops
	clientId?: string | null;
	clientSequenceNumber?: number;
	metadata?: { batchId?: string; batch?: boolean };
	contents?: unknown;
	type?: string;
}): ISequencedDocumentMessage {
	return {
		// eslint-disable-next-line unicorn/no-null -- default clientId mirrors the legacy string | null shape the resolver guards against
		clientId: null,
		clientSequenceNumber: 0,
		timestamp: fields.sequenceNumber * 1000,
		...fields,
	} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage;
}

/**
 * Builds a raw chunk op (`chunkId` of `totalChunks`) for a client's chunk stream.
 */
function makeChunkOp(fields: {
	sequenceNumber: number;
	clientId: string;
	clientSequenceNumber?: number;
	chunkId: number;
	totalChunks: number;
	chunkContents?: string;
	originalMetadata?: { batchId?: string; batch?: boolean };
}): ISequencedDocumentMessage {
	return makeOp({
		sequenceNumber: fields.sequenceNumber,
		clientId: fields.clientId,
		clientSequenceNumber: fields.clientSequenceNumber ?? 1,
		type: MessageType.Operation,
		contents: {
			type: ContainerMessageType.ChunkedOp,
			contents: {
				chunkId: fields.chunkId,
				totalChunks: fields.totalChunks,
				contents: fields.chunkContents ?? "",
				originalMetadata: fields.originalMetadata,
			},
		},
	});
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
	currentTimestamp?: number;
	currentMinimumSequenceNumber?: () => number;
	currentPendingBatchId?: string;
	onFlush?: () => void;
	logger?: MockLogger;
	unpackerFactory?: () => (op: ISequencedDocumentMessage) => InboundMessageResult | undefined;
}): VersionMarkResolver {
	return new VersionMarkResolver({
		getCurrentSequenceNumber: () => options?.currentSequenceNumber ?? 0,
		getCurrentTimestamp: () => options?.currentTimestamp,
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
 * Builds the REAL inbound unpack pipeline, matching the container's `createHistoricalOpUnpacker`: a
 * fresh `RemoteMessageProcessor` over a real `OpSplitter`/`OpDecompressor`/`OpGroupingManager`.
 */
function makeRealUnpackerFactory(): () => (
	op: ISequencedDocumentMessage,
) => InboundMessageResult | undefined {
	const logger = new MockLogger();
	return () => {
		const processor = new RemoteMessageProcessor(
			new OpSplitter([], undefined, 0, Number.POSITIVE_INFINITY, logger, {
				allowInitialPartialChunkStream: true,
			}),
			new OpDecompressor(logger),
			new OpGroupingManager({ groupedBatchingEnabled: false }, logger),
		);
		return (op) => {
			// Mirror the live path by construction: reuse the same helper `createHistoricalOpUnpacker`
			// does, so this "faithful mirror" can't silently desync if the runtime-op invariant changes.
			const messageCopy = tryGetDeserializedRuntimeOpCopy(op);
			if (messageCopy === undefined) {
				return undefined;
			}
			return processor.process(messageCopy, () => {});
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
				// Inclusive lower bound: the pending batch is sequenced after the reference point (42),
				// so its first possible sequence number is 43.
				sequenceNumberLowerBound: 43,
			});
		});

		it("returns a resolved capture at the current sequence number when nothing is pending", () => {
			const resolver = makeResolver({ currentSequenceNumber: 42, currentTimestamp: 42000 });
			assert.deepEqual(resolver.sealAndCaptureVersionMark(), {
				kind: "resolved",
				sequenceNumber: 42,
				timestamp: 42000,
			});
		});

		it("flushes the current batch before reading, so a just-submitted edit's batchId is captured", () => {
			// Before flush there is no pending batch; the flush "seals" it and assigns the batchId. Capture
			// must flush first, so it observes the sealed batch rather than the pre-flush undefined.
			let pendingBatchId: string | undefined;
			const resolver = new VersionMarkResolver({
				getCurrentSequenceNumber: () => 100,
				getCurrentTimestamp: () => undefined,
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
				sequenceNumberLowerBound: 101,
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
			resolver.processInboundBatch("client_[5]", 12, 12000);
			assert.deepEqual(await resolver.resolve("client_[5]", 0), {
				kind: "resolved",
				sequenceNumber: 12,
				timestamp: 12000,
			});
		});

		it("prefers the live map over a history read (reader is not consulted)", async () => {
			const calls: { from: number; to?: number }[] = [];
			const reader = makeReader([], calls);
			const resolver = makeResolver({ reader });
			resolver.processInboundBatch("client_[5]", 12, 12000);

			assert.deepEqual(await resolver.resolve("client_[5]", 999), {
				kind: "resolved",
				sequenceNumber: 12,
				timestamp: 12000,
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
				timestamp: 12000,
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
				timestamp: 20000,
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
				timestamp: 11000,
			});
		});

		it("resolves a batch whose op sits exactly at the inclusive lower bound", async () => {
			// The lower bound is inclusive, so an op sequenced at exactly `sequenceNumberLowerBound` is
			// in range: it resolves and must not trip the reader-contract assert (`firstScanned >= from`).
			const calls: { from: number; to?: number }[] = [];
			const reader = makeReader(
				[[makeOp({ sequenceNumber: 15, clientId: "clientA", clientSequenceNumber: 7 })]],
				calls,
			);
			const resolver = makeResolver({ reader });
			assert.deepEqual(await resolver.resolve(generateBatchId("clientA", 7), 15), {
				kind: "resolved",
				sequenceNumber: 15,
				timestamp: 15000,
			});
			assert.deepEqual(calls, [{ from: 15, to: undefined }]);
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
				timestamp: 32000,
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
				timestamp: 41000,
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
				timestamp: 51000,
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
				timestamp: 62000,
			});
		});
	});

	describe("resolveFromHistory - partial initial chunk stream", () => {
		it("resolves a complete chunked target interleaved with another client's partial stream", async () => {
			const targetContents = JSON.stringify({
				type: ContainerMessageType.FluidDataStoreOp,
				contents: {},
			});
			const splitAt = Math.ceil(targetContents.length / 2);
			const reader = makeReader([
				[
					makeChunkOp({
						sequenceNumber: 11,
						clientId: "partialClient",
						chunkId: 2,
						totalChunks: 3,
					}),
					makeChunkOp({
						sequenceNumber: 12,
						clientId: "targetClient",
						clientSequenceNumber: 1,
						chunkId: 1,
						totalChunks: 2,
						chunkContents: targetContents.slice(0, splitAt),
					}),
					makeChunkOp({
						sequenceNumber: 13,
						clientId: "partialClient",
						chunkId: 3,
						totalChunks: 3,
					}),
					makeChunkOp({
						sequenceNumber: 14,
						clientId: "targetClient",
						clientSequenceNumber: 2,
						chunkId: 2,
						totalChunks: 2,
						chunkContents: targetContents.slice(splitAt),
						originalMetadata: { batchId: "target_[1]" },
					}),
				],
			]);
			const resolver = makeResolver({ reader, unpackerFactory: makeRealUnpackerFactory() });

			assert.deepEqual(await resolver.resolve("target_[1]", 5), {
				kind: "resolved",
				sequenceNumber: 14,
				timestamp: 14000,
			});
		});

		it("does not deserialize a non-runtime op with non-JSON string contents", async () => {
			const reader = makeReader([
				[
					makeOp({
						sequenceNumber: 11,
						clientId: "server",
						type: "join",
						contents: "not json {{{",
					}),
				],
			]);
			const resolver = makeResolver({
				reader,
				currentSequenceNumber: 0,
				unpackerFactory: makeRealUnpackerFactory(),
			});

			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 1), 5), {
				kind: "pending",
			});
		});
	});

	describe("resolveFromHistory - not found: pending vs unresolvable", () => {
		it("unresolvable when a trim gap sits at the anchor (first op past `from`)", async () => {
			// from = 1, but the earliest available op is 10 → [1, 10) was trimmed, taking the mark's batch.
			const reader = makeReader([
				[makeOp({ sequenceNumber: 10, clientId: "other", clientSequenceNumber: 1 })],
			]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 12 });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 1), {
				kind: "unresolvable",
			});
		});

		it("unresolvable when the range was trimmed (empty read despite sequenced ops)", async () => {
			// tip (20) is well past `from` (1), so ops should exist; an empty read means the range was trimmed.
			const reader = makeReader([]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 20 });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 1), {
				kind: "unresolvable",
			});
		});

		it("unresolvable on an empty read when `from` equals the tip (boundary)", async () => {
			// tip (6) == `from` (6): the lower bound is at the tip, so an op could exist there. An empty
			// read therefore means the range was trimmed, not that nothing is sequenced yet → unresolvable.
			const reader = makeReader([]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 6 });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 6), {
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
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 6), {
				kind: "pending",
			});
		});

		it("pending when nothing has sequenced past the lower bound", async () => {
			// tip (5) < sequenceNumberLowerBound (6), so `from` (6) is beyond the tip: the batch cannot have landed.
			const reader = makeReader([]);
			const resolver = makeResolver({ reader, currentSequenceNumber: 5 });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 9), 6), {
				kind: "pending",
			});
		});

		it("reads from sequenceNumberLowerBound (the inclusive lower-bound anchor)", async () => {
			const calls: { from: number; to?: number }[] = [];
			const reader = makeReader([], calls);
			const resolver = makeResolver({ reader });
			await resolver.resolve(generateBatchId("missing", 9), 10);
			assert.deepEqual(calls, [{ from: 10, to: undefined }]);
		});

		it("asserts when the reader returns an op before the requested range start", async () => {
			// The trim inference relies on the reader never returning an op earlier than `from`. A reader
			// that violates this (returns seq 5 when from = 10) must fail loudly, not silently misclassify.
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
			const events: [string, number, number | undefined][] = [];
			resolver.onBatchSequenced((batchId, sequenceNumber, timestamp) =>
				events.push([batchId, sequenceNumber, timestamp]),
			);
			resolver.processInboundBatch("client_[1]", 5, 5000);
			resolver.processInboundBatch("client_[2]", 6, 6000);
			assert.deepEqual(events, [
				["client_[1]", 5, 5000],
				["client_[2]", 6, 6000],
			]);
		});

		it("stops notifying after unsubscribe", () => {
			const resolver = makeResolver();
			const events: [string, number, number | undefined][] = [];
			const unsubscribe = resolver.onBatchSequenced((batchId, sequenceNumber, timestamp) =>
				events.push([batchId, sequenceNumber, timestamp]),
			);
			resolver.processInboundBatch("client_[1]", 5, 5000);
			unsubscribe();
			resolver.processInboundBatch("client_[2]", 6, 6000);
			assert.deepEqual(events, [["client_[1]", 5, 5000]]);
		});

		it("does not re-notify when the same batchId maps to the same sequence number", () => {
			const resolver = makeResolver();
			const events: [string, number, number | undefined][] = [];
			resolver.onBatchSequenced((batchId, sequenceNumber, timestamp) =>
				events.push([batchId, sequenceNumber, timestamp]),
			);
			resolver.processInboundBatch("client_[1]", 5, 5000);
			resolver.processInboundBatch("client_[1]", 5, 5000);
			assert.deepEqual(events, [["client_[1]", 5, 5000]]);
		});

		it("keeps the earlier resolution on a conflicting remap (same batchId, different sequence number)", async () => {
			const resolver = makeResolver();
			const events: [string, number, number | undefined][] = [];
			resolver.onBatchSequenced((batchId, sequenceNumber, timestamp) =>
				events.push([batchId, sequenceNumber, timestamp]),
			);
			resolver.processInboundBatch("client_[1]", 5, 5000);
			// The service can re-broadcast the same batch under a different sequence number/timestamp
			// (tolerated by DuplicateBatchDetector for a batch with no explicit batchId). The first landing
			// is the one peers actually applied and is a sufficient version mark on its own, so the resolver
			// must not overwrite it or re-notify subscribers with the spurious remap.
			resolver.processInboundBatch("client_[1]", 6, 6000);
			assert.deepEqual(events, [["client_[1]", 5, 5000]]);
			assert.deepEqual(await resolver.resolve("client_[1]", 0), {
				kind: "resolved",
				sequenceNumber: 5,
				timestamp: 5000,
			});
		});

		it("makes a processed batch resolvable via the live fast path", async () => {
			const resolver = makeResolver();
			resolver.processInboundBatch("client_[7]", 21, 21000);
			assert.deepEqual(await resolver.resolve("client_[7]", 0), {
				kind: "resolved",
				sequenceNumber: 21,
				timestamp: 21000,
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
			assert.doesNotThrow(() => resolver.processInboundBatch("client_[1]", 5, 5000));
			// Listeners registered both before and after the throwing one still fire.
			assert.deepEqual(before, [["client_[1]", 5]]);
			assert.deepEqual(after, [["client_[1]", 5]]);
			// The fault is logged rather than swallowed.
			logger.assertMatch([{ eventName: "VersionMarkListenerException", category: "error" }]);
			// The batch is still recorded despite the fault, so it resolves via the live fast path.
			assert.deepEqual(await resolver.resolve("client_[1]", 0), {
				kind: "resolved",
				sequenceNumber: 5,
				timestamp: 5000,
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
			resolver.processInboundBatch("a_[1]", 5, 5000);
			resolver.processInboundBatch("b_[2]", 10, 10000);
			assert.deepEqual(await resolver.resolve("a_[1]", 0), {
				kind: "resolved",
				sequenceNumber: 5,
				timestamp: 5000,
			});

			// Advancing the MSN past seq 5 evicts a_[1] on the next inbound batch; b_[2] (seq 10) is retained.
			minimumSequenceNumber = 8;
			resolver.processInboundBatch("c_[3]", 12, 12000);

			assert.deepEqual(await resolver.resolve("a_[1]", 0), { kind: "pending" });
			assert.deepEqual(await resolver.resolve("b_[2]", 0), {
				kind: "resolved",
				sequenceNumber: 10,
				timestamp: 10000,
			});
			assert.deepEqual(await resolver.resolve("c_[3]", 0), {
				kind: "resolved",
				sequenceNumber: 12,
				timestamp: 12000,
			});
		});

		it("never evicts the just-recorded batch (its seq is at or above the MSN)", async () => {
			const resolver = makeResolver({ currentMinimumSequenceNumber: () => 100 });
			resolver.processInboundBatch("recent_[1]", 100, 100000);
			assert.deepEqual(await resolver.resolve("recent_[1]", 0), {
				kind: "resolved",
				sequenceNumber: 100,
				timestamp: 100000,
			});
		});
	});

	describe("resolve telemetry (Resolve event)", () => {
		it("emits a Resolve event for a history-resolved mark", async () => {
			const logger = new MockLogger();
			const reader = makeReader([
				[
					makeOp({
						sequenceNumber: 20,
						clientId: "target",
						clientSequenceNumber: 1,
						metadata: { batch: true },
					}),
					makeOp({
						sequenceNumber: 21,
						clientId: "target",
						clientSequenceNumber: 2,
						metadata: { batch: false },
					}),
				],
			]);
			const resolver = makeResolver({ reader, logger });
			assert.deepEqual(await resolver.resolve(generateBatchId("target", 1), 5), {
				kind: "resolved",
				sequenceNumber: 21,
				timestamp: 21000,
			});
			logger.assertMatch([
				{
					eventName: "Resolve",
					outcome: "resolved",
					path: "history",
					sequenceNumber: 21,
				},
			]);
		});

		it("emits path 'noReader' when no historical reader is wired", async () => {
			const logger = new MockLogger();
			const resolver = makeResolver({ logger });
			assert.deepEqual(await resolver.resolve(generateBatchId("missing", 1), 5), {
				kind: "pending",
			});
			logger.assertMatch([
				{
					eventName: "Resolve",
					outcome: "pending",
					path: "noReader",
				},
			]);
		});

		it("emits path 'session' on a live fast-path hit", async () => {
			const logger = new MockLogger();
			const resolver = makeResolver({ logger });
			resolver.processInboundBatch("live_[1]", 7, 7000);
			assert.deepEqual(await resolver.resolve("live_[1]", 5), {
				kind: "resolved",
				sequenceNumber: 7,
				timestamp: 7000,
			});
			logger.assertMatch([
				{
					eventName: "Resolve",
					outcome: "resolved",
					path: "session",
					sequenceNumber: 7,
				},
			]);
		});

		it("emits outcome 'error' (via finally) when the history scan throws", async () => {
			const logger = new MockLogger();
			const reader: IHistoricalOpReader = {
				async fetchMessages(): Promise<IStream<ISequencedDocumentMessage[]>> {
					throw new Error("delta storage boom");
				},
			};
			const resolver = makeResolver({ reader, logger });
			// The throw propagates (resolve does not swallow it)...
			await assert.rejects(resolver.resolve(generateBatchId("missing", 1), 5), /boom/);
			// ...but the Resolve event still fires with outcome "error".
			logger.assertMatch([{ eventName: "Resolve", outcome: "error", path: "history" }]);
		});
	});
});
