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
 * Result of resolving a pending batchId. A resolved result includes the matched batch's last op server
 * timestamp when available. The property is optional for compatibility with previously stored results.
 *
 * @legacy @beta
 */
export type ResolveResult =
	| {
			readonly kind: "resolved";
			readonly sequenceNumber: number;
			readonly timestamp?: number;
	  }
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
	| {
			readonly kind: "resolved";
			readonly sequenceNumber: number;
			readonly timestamp?: number;
	  };

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
	 * unacked local batch, or a `resolved` capture (`sequenceNumber` + the last processed op's server
	 * `timestamp`) when there is no in-flight local work. The timestamp property is optional for
	 * compatibility with previously stored captures.
	 *
	 * @remarks Sealing the batch is a side effect (it submits the current batch), so capture at savepoint
	 * boundaries, not per keystroke.
	 *
	 * @returns The pending batch identity and exclusive sequence number lower bound, or the current sequence number
	 * and last processed op timestamp when there is no pending local batch.
	 */
	sealAndCaptureVersionMark(): VersionMarkCapture;
	/**
	 * Resolves a pending mark's batchId to a global sequence number (`sequenceNumberLowerBound` is the
	 * inclusive lower bound for a history read). A `resolved` sequence number feeds the loader's
	 * `loadContainerToSequenceNumber`.
	 *
	 * @param batchId - The stable identity of the pending batch.
	 * @param sequenceNumberLowerBound - The exclusive lower bound for the historical op search.
	 * @returns The resolved sequence number and server timestamp, or a result indicating that the batch
	 * remains pending or can no longer be resolved.
	 */
	resolve(batchId: string, sequenceNumberLowerBound: number): Promise<ResolveResult>;
	/**
	 * Subscribes to inbound batch sequencing: fires `(batchId, sequenceNumber, timestamp)` per batch so any
	 * connected client can promote a matching pending mark. Returns an unsubscribe function.
	 *
	 * @param listener - Called with the stable batch identity, its final sequence number, and the final op's
	 * server timestamp.
	 * @returns A function that unsubscribes the listener.
	 */
	onBatchSequenced(
		listener: (batchId: string, sequenceNumber: number, timestamp?: number) => void,
	): () => void;
}

/**
 * @internal
 */
export interface VersionMarkResolverRuntimeHooks {
	readonly getCurrentSequenceNumber: () => number;
	readonly getCurrentTimestamp: () => number | undefined;
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
	private readonly resolvedBatchById = new Map<
		string,
		{ readonly sequenceNumber: number; readonly timestamp: number }
	>();
	private readonly batchListeners = new Set<
		(batchId: string, sequenceNumber: number, timestamp: number) => void
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
		const referenceSequenceNumber = this.hooks.getCurrentSequenceNumber();
		const batchId = this.hooks.getCurrentPendingBatchId();
		if (batchId === undefined) {
			// No unacked local batch: the mark already points at a durable sequence number.
			return {
				kind: "resolved",
				sequenceNumber: sequenceNumberLowerBound,
				timestamp: this.hooks.getCurrentTimestamp(),
			};
		}
		// A pending mark needs its batch tracked so resolve() can promote it from the live map.
		this.tracking = true;
		// The pending batch is sequenced after the reference point, so its first possible sequence
		// number is `referenceSequenceNumber + 1`. Store that as an inclusive lower bound so resolve()
		// scans directly from it.
		return { kind: "pending", batchId, sequenceNumberLowerBound: referenceSequenceNumber + 1 };
	}

	public async resolve(
		batchId: string,
		sequenceNumberLowerBound: number,
	): Promise<ResolveResult> {
		const startTime = Date.now();
		// Defaults cover the throw path (only the history scan can throw — e.g. an unpacker
		// DataCorruptionError or the 0xd1c reader-contract assert): the Resolve event still fires via
		// `finally`, with outcome "error".
		let path: "session" | "history" | "noReader" = "history";
		let outcome: ResolveResult["kind"] | "error" = "error";
		let resolvedSequenceNumber: number | undefined;
		try {
			// Fast path: batch sequenced live this session.
			const resolvedBatch = this.sessionResolutionFor(batchId);
			if (resolvedBatch === undefined) {
				const reader = this.hooks.getHistoricalOpReader?.();
				if (reader === undefined) {
					// No reader: the batch may still sequence live, so report pending.
					path = "noReader";
					outcome = "pending";
					return { kind: "pending" };
				}
				// Otherwise scan history from the mark's reference point.
				path = "history";
				const result = await this.resolveFromHistory(
					reader,
					batchId,
					sequenceNumberLowerBound,
				);
				outcome = result.kind;
				if (result.kind === "resolved") {
					resolvedSequenceNumber = result.sequenceNumber;
				}
				return result;
			}
			path = "session";
			outcome = "resolved";
			resolvedSequenceNumber = resolvedBatch.sequenceNumber;
			return { kind: "resolved", ...resolvedBatch };
		} finally {
			this.hooks.logger.sendTelemetryEvent({
				eventName: "Resolve",
				outcome,
				path,
				durationMs: Date.now() - startTime,
				...(resolvedSequenceNumber === undefined
					? {}
					: { sequenceNumber: resolvedSequenceNumber }),
			});
		}
	}

	/**
	 * Scans sequenced ops from `sequenceNumberLowerBound` (inclusive) for `batchId`, returning its last op's
	 * sequence number when found and aborting the fetch once found or exhausted. Each op is routed through
	 * the same unpack pipeline the live inbound path uses (chunk reassembly, ungroup, decompress) and
	 * {@link inboundVersionMarkUpdate} derives its batch identity, so virtualized batches resolve here too.
	 * The injected historical unpacker owns virtualization details, including tolerating a requested range
	 * that begins within an incomplete chunk stream. On a miss, {@link classifyMiss} distinguishes
	 * `pending` (not sequenced yet) from `unresolvable` (ops trimmed).
	 */
	private async resolveFromHistory(
		reader: IHistoricalOpReader,
		batchId: string,
		sequenceNumberLowerBound: number,
	): Promise<ResolveResult> {
		const from = sequenceNumberLowerBound;
		const unpack = this.hooks.createHistoricalOpUnpacker?.();
		const abortController = new AbortController();
		try {
			const stream = await reader.fetchMessages(from, undefined, abortController.signal);
			let firstScannedSequenceNumber: number | undefined;
			let carriedBatchId: string | undefined;
			while (true) {
				const result = await stream.read();
				if (result.done) {
					break;
				}
				for (const op of result.value) {
					firstScannedSequenceNumber ??= op.sequenceNumber;
					// undefined = a system op or virtualized input that has not produced a complete result.
					const inboundResult = unpack?.(op);
					if (inboundResult === undefined) {
						continue;
					}
					// Derive batch identity exactly as the live inbound path does, carrying the id across a
					// piecemeal batch's messages.
					const update = inboundVersionMarkUpdate(inboundResult, carriedBatchId);
					carriedBatchId = update.carriedBatchId;
					if (update.sequenced?.batchId === batchId) {
						return {
							kind: "resolved",
							sequenceNumber: update.sequenced.sequenceNumber,
							timestamp: update.sequenced.timestamp,
						};
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
			// Nothing is sequenced at/after the mark's lower bound yet, so the batch cannot have landed.
			return { kind: "pending" };
		}
		if (firstScannedSequenceNumber === undefined) {
			// Empty read though ops should exist in `[from, tip]` → trimmed. ODSP-specific: a strict driver
			// empties a `from`-misaligned trimmed range (validateMessages); a return-from-earliest driver
			// would instead surface the trim via the `firstScannedSequenceNumber > from` branch below.
			return { kind: "unresolvable" };
		}
		if (firstScannedSequenceNumber > from) {
			// A trim gap at the anchor: the mark's ops (at/after its lower bound) are gone.
			return { kind: "unresolvable" };
		}
		// Ops are present from the lower bound and the batch is not among them: not yet sequenced.
		return { kind: "pending" };
	}

	public onBatchSequenced(
		listener: (batchId: string, sequenceNumber: number, timestamp?: number) => void,
	): () => void {
		// A subscriber wants live promotions, so start tracking inbound batches from here on.
		this.tracking = true;
		this.batchListeners.add(listener);
		return () => {
			this.batchListeners.delete(listener);
		};
	}

	/** The resolved point for a batch seen live this session, or undefined. */
	private sessionResolutionFor(
		batchId: string,
	): { readonly sequenceNumber: number; readonly timestamp: number } | undefined {
		return this.resolvedBatchById.get(batchId);
	}

	/** Records an inbound batch and notifies listeners so any client can promote matching pending marks. */
	public processInboundBatch(
		batchId: string,
		sequenceNumber: number,
		timestamp: number,
	): void {
		const existingResolution = this.resolvedBatchById.get(batchId);
		if (
			existingResolution?.sequenceNumber === sequenceNumber &&
			existingResolution.timestamp === timestamp
		) {
			return;
		}
		// The protocol guarantees a `batchId` maps to one sequence number; a conflicting remap would also
		// break the insertion-order invariant MSN eviction relies on, so fail loudly instead of overwriting.
		assert(
			existingResolution === undefined,
			0xd34 /* version mark batchId remapped to a different sequence number */,
		);

		this.resolvedBatchById.set(batchId, { sequenceNumber, timestamp });
		this.evictBelowMinimumSequenceNumber();
		for (const listener of this.batchListeners) {
			try {
				listener(batchId, sequenceNumber, timestamp);
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
		for (const [id, resolution] of this.resolvedBatchById) {
			if (resolution.sequenceNumber >= minimumSequenceNumber) {
				break;
			}
			this.resolvedBatchById.delete(id);
		}
	}
}
