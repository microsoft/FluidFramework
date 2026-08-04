/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISequencedDocumentMessage,
	IStream,
} from "@fluidframework/driver-definitions/internal";

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
 * Result of resolving a pending batchId.
 *
 * @internal
 */
export type ResolveResult =
	| { readonly status: "resolved"; readonly sequenceNumber: number }
	| { readonly status: "pending" }
	| { readonly status: "unresolvable" };

/**
 * Runtime-owned resolver for app-stored version mark locators.
 *
 * @internal
 */
export interface IVersionMarkResolver {
	getCurrentPendingBatchId(): string | undefined;
	getCurrentSequenceNumber(): number;
	/**
	 * Resolves a pending mark's batchId to a global sequence number (`referenceSequenceNumber` is the lower
	 * bound for a history read). A `resolved` sequence number feeds the loader's `loadContainerToSequenceNumber`.
	 */
	resolve(batchId: string, referenceSequenceNumber: number): Promise<ResolveResult>;
	/**
	 * Subscribes to inbound batch sequencing: fires `(batchId, sequenceNumber)` per batch so any connected
	 * client can promote a matching pending mark. Returns an unsubscribe function.
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

	public constructor(private readonly hooks: VersionMarkResolverRuntimeHooks) {}

	public getCurrentPendingBatchId(): string | undefined {
		return this.hooks.getCurrentPendingBatchId();
	}

	public getCurrentSequenceNumber(): number {
		return this.hooks.getCurrentSequenceNumber();
	}

	public async resolve(
		batchId: string,
		referenceSequenceNumber: number,
	): Promise<ResolveResult> {
		// Fast path: batch sequenced live this session.
		const sequenceNumber = this.sessionSequenceFor(batchId);
		if (sequenceNumber !== undefined) {
			return { status: "resolved", sequenceNumber };
		}

		// Otherwise scan history from the mark's reference point.
		const reader = this.hooks.getHistoricalOpReader?.();
		if (reader === undefined) {
			// No reader: the batch may still sequence live, so report pending.
			return { status: "pending" };
		}
		return this.resolveFromHistory(reader, batchId, referenceSequenceNumber);
	}

	/**
	 * Scans sequenced ops from `referenceSequenceNumber` forward for `batchId`, returning its last op's
	 * sequence number when found and aborting the fetch once found or exhausted. Each op is routed through
	 * the same unpack pipeline the live inbound path uses (chunk reassembly, ungroup, decompress) and
	 * {@link inboundVersionMarkUpdate} derives its batch identity, so chunked batches resolve here too. On a
	 * miss, {@link classifyMiss} distinguishes `pending` (not sequenced yet) from `unresolvable` (ops
	 * trimmed). See DEV.md.
	 */
	private async resolveFromHistory(
		reader: IHistoricalOpReader,
		batchId: string,
		referenceSequenceNumber: number,
	): Promise<ResolveResult> {
		const from = referenceSequenceNumber + 1;
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
					// undefined = a system op, or an incomplete chunk awaiting later fragments.
					const inboundResult = unpack?.(op);
					if (inboundResult === undefined) {
						continue;
					}
					// Derive batch identity exactly as the live inbound path does, carrying the id across a
					// piecemeal batch's messages.
					const update = inboundVersionMarkUpdate(inboundResult, carriedBatchId);
					carriedBatchId = update.carriedBatchId;
					if (update.sequenced?.batchId === batchId) {
						return { status: "resolved", sequenceNumber: update.sequenced.sequenceNumber };
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
		const tip = this.hooks.getCurrentSequenceNumber();
		if (from > tip) {
			// Nothing is sequenced at/after the mark's reference point yet, so the batch cannot have landed.
			return { status: "pending" };
		}
		if (firstScannedSequenceNumber === undefined) {
			// Ops should exist in `[from, tip]` but the read came back empty: the range was trimmed.
			return { status: "unresolvable" };
		}
		if (firstScannedSequenceNumber > from) {
			// A trim gap at the anchor: the mark's ops (just after the reference point) are gone.
			return { status: "unresolvable" };
		}
		// Ops are present from the reference point and the batch is not among them: not yet sequenced.
		return { status: "pending" };
	}

	public onBatchSequenced(
		listener: (batchId: string, sequenceNumber: number) => void,
	): () => void {
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
			listener(batchId, sequenceNumber);
		}
	}

	/**
	 * Bounds the map to the collaboration window by dropping entries below the MSN (mirrors
	 * `DuplicateBatchDetector`). Entries insert in sequence order, so it stops at the first retained one; a
	 * dropped entry falls back to the history scan.
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
