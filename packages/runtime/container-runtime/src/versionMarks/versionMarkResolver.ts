/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISequencedDocumentMessage,
	IStream,
} from "@fluidframework/driver-definitions/internal";

import { assert } from "@fluidframework/core-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { InboundMessageResult } from "../opLifecycle/index.js";
import { asBatchMetadata } from "../metadata.js";

import { inboundVersionMarkUpdate } from "./inboundBatch.js";

/**
 * Reads sequenced ops in `[from, to)` from delta storage, injected by the container so the runtime stays
 * driver-agnostic. `abortSignal` cancels an in-flight fetch.
 *
 * @internal
 */
export interface IHistoricalOpReader {
	fetchMessages(
		from: number,
		to?: number,
		abortSignal?: AbortSignal,
	): Promise<IStream<ISequencedDocumentMessage[]>>;
}

/**
 * Result of resolving a pending batchId.
 *
 * @legacy @beta
 */
export type ResolveResult =
	| { readonly kind: "resolved"; readonly sequenceNumber: number }
	| { readonly kind: "pending" }
	| { readonly kind: "unresolvable" };

/**
 * The data captured for a version mark. `pending` when the captured edit is local and not yet sequenced
 * (resolve it later via {@link IVersionMarkResolver.resolve}); `resolved` when there is no in-flight local
 * work, so the mark already points at a durable sequence number. The app packs its own stored record from
 * this — the runtime does not define the stored locator shape.
 *
 * @legacy @beta
 */
export type VersionMarkCapture =
	| {
			readonly kind: "pending";
			readonly batchId: string;
			readonly sequenceNumberLowerBound: number;
	  }
	| { readonly kind: "resolved"; readonly sequenceNumber: number };

/**
 * Runtime-owned resolver for app-stored version mark locators.
 *
 * @legacy @beta
 */
export interface IVersionMarkResolver {
	/**
	 * Captures a version mark at the current point. Seals the current outbound batch first (so a just-made
	 * local edit has a stable `batchId`, which is only assigned when a batch is flushed), then returns the
	 * mark data atomically: a `pending` capture (`batchId` + `sequenceNumberLowerBound`) when there is an
	 * unacked local batch, or a `resolved` capture (`sequenceNumber`) when there is no in-flight local work.
	 *
	 * @remarks Sealing the batch is a side effect (it submits the current batch), so capture at savepoint
	 * boundaries, not per keystroke.
	 *
	 * @returns The pending batch identity and exclusive sequence number lower bound, or the current sequence number
	 * when there is no pending local batch.
	 */
	sealAndCaptureVersionMark(): VersionMarkCapture;
	/**
	 * Resolves a pending mark's batchId to a global sequence number (`sequenceNumberLowerBound` is the
	 * exclusive lower bound for a history read). A `resolved` sequence number feeds the loader's
	 * `loadContainerToSequenceNumber`.
	 *
	 * @param batchId - The stable identity of the pending batch.
	 * @param sequenceNumberLowerBound - The exclusive lower bound for the historical op search.
	 * @returns The resolved sequence number, or a result indicating that the batch remains pending or can
	 * no longer be resolved.
	 */
	resolve(batchId: string, sequenceNumberLowerBound: number): Promise<ResolveResult>;
	/**
	 * Subscribes to inbound batch sequencing: fires `(batchId, sequenceNumber)` per batch so any connected
	 * client can promote a matching pending mark. Returns an unsubscribe function.
	 *
	 * @param listener - Called with the stable batch identity and its final sequence number.
	 * @returns A function that unsubscribes the listener.
	 */
	onBatchSequenced(listener: (batchId: string, sequenceNumber: number) => void): () => void;
}

/**
 * @internal
 */
export interface VersionMarkResolverRuntimeHooks {
	readonly getCurrentSequenceNumber: () => number;
	readonly getCurrentMinimumSequenceNumber: () => number;
	readonly getCurrentPendingBatchId: () => string | undefined;
	/** Logs faults from app-supplied `onBatchSequenced` listeners (see {@link VersionMarkResolver.processInboundBatch}). */
	readonly logger: TelemetryLoggerExt;
	/**
	 * Seals the current outbound batch (flushes the runtime), so a just-submitted local edit is moved into
	 * the pending state with a stable `batchId` before
	 * {@link IVersionMarkResolver.sealAndCaptureVersionMark} reads it.
	 */
	readonly flushPendingBatch: () => void;
	/**
	 * Injected by the container, backed by delta storage. When absent, unknown batchIds resolve as `pending`.
	 */
	readonly getHistoricalOpReader?: () => IHistoricalOpReader | undefined;
	/**
	 * Creates a per-scan op unpacker that mirrors the live inbound path (chunk reassembly, ungroup,
	 * decompress), so the history scan observes the same restored `batchId` — in particular for chunked
	 * batches, whose id is stripped from the final chunk's wire metadata and restored only after
	 * reassembly. A fresh unpacker is created per scan since it holds reassembly state. When absent, the
	 * history scan cannot identify batches and reports `pending`/`unresolvable`.
	 */
	readonly createHistoricalOpUnpacker?: () => (
		op: ISequencedDocumentMessage,
	) => InboundMessageResult | undefined;
}

/**
 * Resolves a mark's batchId to a global sequence number. The app owns mark storage and promotion; the
 * runtime exposes the capture point and an ephemeral in-session `batchId -> sequenceNumber` map.
 *
 * @internal
 */
export class VersionMarkResolver implements IVersionMarkResolver {
	private readonly sequenceNumberByBatchId = new Map<string, number>();
	private readonly batchListeners = new Set<
		(batchId: string, sequenceNumber: number) => void
	>();
	/**
	 * Sticky flag: false until the feature is first used this session (a pending capture or a listener).
	 * While false the runtime skips all per-inbound-batch tracking, so a container that never uses version
	 * marks pays nothing on the hot path (mirrors #22497 gating `DuplicateBatchDetector` on offline load).
	 */
	private tracking = false;

	public constructor(private readonly hooks: VersionMarkResolverRuntimeHooks) {}

	/** Whether inbound batches need tracking (see {@link tracking}). Read by the runtime to gate the hot path. */
	public get isTracking(): boolean {
		return this.tracking;
	}

	public sealAndCaptureVersionMark(): VersionMarkCapture {
		// Seal the current batch so a just-submitted local edit is flushed into the pending state with a
		// stable batchId (which is only assigned at flush) before we read it.
		this.hooks.flushPendingBatch();
		const sequenceNumberLowerBound = this.hooks.getCurrentSequenceNumber();
		const batchId = this.hooks.getCurrentPendingBatchId();
		if (batchId === undefined) {
			// No unacked local batch: the mark already points at a durable sequence number.
			return { kind: "resolved", sequenceNumber: sequenceNumberLowerBound };
		}
		// A pending mark needs its batch tracked so resolve() can promote it from the live map.
		this.tracking = true;
		return { kind: "pending", batchId, sequenceNumberLowerBound };
	}

	public async resolve(
		batchId: string,
		sequenceNumberLowerBound: number,
	): Promise<ResolveResult> {
		// Fast path: batch sequenced live this session.
		const sequenceNumber = this.sessionSequenceFor(batchId);
		if (sequenceNumber !== undefined) {
			return { kind: "resolved", sequenceNumber };
		}

		// Otherwise scan history from the mark's reference point.
		const reader = this.hooks.getHistoricalOpReader?.();
		if (reader === undefined) {
			// No reader: the batch may still sequence live, so report pending.
			return { kind: "pending" };
		}
		return this.resolveFromHistory(reader, batchId, sequenceNumberLowerBound);
	}

	/**
	 * Scans sequenced ops after `sequenceNumberLowerBound` for `batchId`, returning its last op's
	 * sequence number when found and aborting the fetch once found or exhausted. Each op is routed through
	 * the same unpack pipeline the live inbound path uses (chunk reassembly, ungroup, decompress) and
	 * {@link inboundVersionMarkUpdate} derives its batch identity, so chunked batches resolve here too. The
	 * scan anchor is not guaranteed to be a batch boundary, so a leading batch clipped by the anchor is
	 * tolerated (its orphan end marker is dropped rather than fed to the processor). On a miss,
	 * {@link classifyMiss} distinguishes `pending` (not sequenced yet) from `unresolvable` (ops trimmed).
	 * See DEV.md.
	 */
	private async resolveFromHistory(
		reader: IHistoricalOpReader,
		batchId: string,
		sequenceNumberLowerBound: number,
	): Promise<ResolveResult> {
		const from = sequenceNumberLowerBound + 1;
		const unpack = this.hooks.createHistoricalOpUnpacker?.();
		const abortController = new AbortController();
		try {
			const stream = await reader.fetchMessages(from, undefined, abortController.signal);
			let firstScannedSequenceNumber: number | undefined;
			let carriedBatchId: string | undefined;
			// Mirrors the processor's batch-in-progress state so we can drop an orphan end marker (below).
			let inBatch = false;
			while (true) {
				const result = await stream.read();
				if (result.done) {
					break;
				}
				for (const op of result.value) {
					firstScannedSequenceNumber ??= op.sequenceNumber;
					if (!inBatch && asBatchMetadata(op.metadata)?.batch === false) {
						// The anchor (`sequenceNumberLowerBound + 1`) may land inside a batch whose start
						// precedes the window; its orphan end marker would trip the processor's 0x9d5 assert.
						// Drop the clipped tail. The target batch is fully in-window, so this can't skip it.
						continue;
					}
					// undefined = a system op, or an incomplete chunk awaiting later fragments.
					const inboundResult = unpack?.(op);
					if (inboundResult === undefined) {
						continue;
					}
					// Track batch progress with the processor so the guard above skips only orphan ends.
					if (inboundResult.type === "batchStartingMessage") {
						inBatch = true;
					} else if (
						inboundResult.type === "nextBatchMessage" &&
						inboundResult.batchEnd === true
					) {
						inBatch = false;
					}
					// Derive batch identity exactly as the live inbound path does, carrying the id across a
					// piecemeal batch's messages.
					const update = inboundVersionMarkUpdate(inboundResult, carriedBatchId);
					carriedBatchId = update.carriedBatchId;
					if (update.sequenced?.batchId === batchId) {
						return { kind: "resolved", sequenceNumber: update.sequenced.sequenceNumber };
					}
				}
			}
			// Not found: distinguish "not sequenced yet" from "trimmed" via the tip and where the scan landed.
			return this.classifyMiss(from, firstScannedSequenceNumber);
		} finally {
			// Cancel any in-flight fetch once we stop reading (found or exhausted).
			abortController.abort();
		}
	}

	/**
	 * Classifies a history-scan miss as `pending` or `unresolvable`. See {@link resolveFromHistory}.
	 */
	private classifyMiss(
		from: number,
		firstScannedSequenceNumber: number | undefined,
	): ResolveResult {
		// Invariant: a reader must never return an op before the requested range start. If it does, the
		// trim inference below is meaningless, so fail loudly rather than misclassify.
		assert(
			firstScannedSequenceNumber === undefined || firstScannedSequenceNumber >= from,
			0xd1c /* historical op reader returned an op before the requested range start */,
		);
		const tip = this.hooks.getCurrentSequenceNumber();
		if (from > tip) {
			// Nothing is sequenced at/after the mark's reference point yet, so the batch cannot have landed.
			return { kind: "pending" };
		}
		if (firstScannedSequenceNumber === undefined) {
			// Empty read though ops should exist in `[from, tip]` → trimmed. ODSP-specific: a strict driver
			// empties a `from`-misaligned trimmed range (validateMessages); a return-from-earliest driver
			// would instead surface the trim via the `firstScannedSequenceNumber > from` branch below.
			return { kind: "unresolvable" };
		}
		if (firstScannedSequenceNumber > from) {
			// A trim gap at the anchor: the mark's ops (just after the reference point) are gone.
			return { kind: "unresolvable" };
		}
		// Ops are present from the reference point and the batch is not among them: not yet sequenced.
		return { kind: "pending" };
	}

	public onBatchSequenced(
		listener: (batchId: string, sequenceNumber: number) => void,
	): () => void {
		// A subscriber wants live promotions, so start tracking inbound batches from here on.
		this.tracking = true;
		this.batchListeners.add(listener);
		return () => {
			this.batchListeners.delete(listener);
		};
	}

	/** The sequence number for a batch seen live this session, or undefined. */
	private sessionSequenceFor(batchId: string): number | undefined {
		return this.sequenceNumberByBatchId.get(batchId);
	}

	/** Records an inbound batch and notifies listeners so any client can promote matching pending marks. */
	public processInboundBatch(batchId: string, sequenceNumber: number): void {
		const existingSequenceNumber = this.sequenceNumberByBatchId.get(batchId);
		if (existingSequenceNumber === sequenceNumber) {
			return;
		}

		this.sequenceNumberByBatchId.set(batchId, sequenceNumber);
		this.evictBelowMinimumSequenceNumber();
		for (const listener of this.batchListeners) {
			try {
				listener(batchId, sequenceNumber);
			} catch (error) {
				// Isolate each app listener (like the container's EventEmitterWithErrorHandling): one throw
				// must not abort op processing or starve the rest. Log and continue rather than fault the
				// container — a missed promotion is recoverable via resolve()'s history scan.
				this.hooks.logger.sendErrorEvent({ eventName: "VersionMarkListenerException" }, error);
			}
		}
	}

	/**
	 * Bounds the map to the collaboration window by dropping entries below the MSN (mirrors
	 * `DuplicateBatchDetector`). Safe because below the MSN every client has processed the batch, so its
	 * `onBatchSequenced` already fired; a dropped entry falls back to the history scan. Entries insert in
	 * sequence order, so iteration stops at the first retained one.
	 */
	private evictBelowMinimumSequenceNumber(): void {
		const minimumSequenceNumber = this.hooks.getCurrentMinimumSequenceNumber();
		for (const [id, sequenceNumber] of this.sequenceNumberByBatchId) {
			if (sequenceNumber >= minimumSequenceNumber) {
				break;
			}
			this.sequenceNumberByBatchId.delete(id);
		}
	}
}
