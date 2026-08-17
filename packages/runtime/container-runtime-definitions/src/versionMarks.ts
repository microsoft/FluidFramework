/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	 * `timestamp`) when there is no in-flight local work. The timestamp property is optional both for
	 * compatibility with previously stored captures and because it is `undefined` when neither a last
	 * processed message nor a last-summary message is available.
	 *
	 * @remarks Sealing the batch is a side effect (it submits the current batch), so capture at savepoint
	 * boundaries, not per keystroke.
	 *
	 * @returns The pending batch identity and inclusive sequence number lower bound, or the current sequence
	 * number and corresponding op timestamp (when available) when there is no pending local batch.
	 */
	sealAndCaptureVersionMark(): VersionMarkCapture;
	/**
	 * Resolves a pending mark's batchId to a global sequence number (`sequenceNumberLowerBound` is the
	 * inclusive lower bound for a history read). A `resolved` sequence number feeds the loader's
	 * `loadContainerToSequenceNumber`.
	 *
	 * @param batchId - The stable identity of the pending batch.
	 * @param sequenceNumberLowerBound - The inclusive lower bound for the historical op search.
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
