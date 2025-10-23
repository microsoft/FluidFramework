/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	IPendingContainerState,
	SerializedSnapshotInfo,
} from "./serializedStateManager.js";
import { getAttachedContainerStateFromSerializedContainer } from "./utils.js";

/**
 * A Map-like store for managing pending local container states from attached containers.
 * Optimizes storage by deduplicating shared resources across stored states.
 *
 * @example
 * ```typescript
 * const store = new PendingLocalStateStore<string>();
 *
 * // Store pending state
 * const pendingState = await attachedContainer.getPendingLocalState();
 * store.set("session1", pendingState);
 *
 * // Load from stored state
 * const restored = store.get("session1");
 * const newContainer = await loadFrozenContainerFromPendingState({
 *   pendingLocalState: restored,
 *   // ... other loader options
 * });
 * ```
 *
 * @remarks
 * Only use with attached containers from the same URL. Only store strings
 * returned by `container.getPendingLocalState()`.
 *
 * @typeParam TKey - The type of keys used to identify stored states
 *
 * @legacy @alpha
 */
export class PendingLocalStateStore<TKey> {
	#firstUrl: string | undefined;
	readonly #pendingStates = new Map<TKey, IPendingContainerState>();
	readonly #savedOps: Record<number, ISequencedDocumentMessage> = {};
	readonly #blobs: Record<string, string> = {};
	readonly #loadingGroups: Record<string, SerializedSnapshotInfo> = {};

	/**
	 * Removes all stored pending states.
	 */
	clear(): void {
		return this.#pendingStates.clear();
	}

	/**
	 * Removes the pending state for the specified key.
	 *
	 * @param key - The key to remove
	 * @returns `true` if the state existed and was removed, `false` otherwise
	 */
	delete(key: TKey): boolean {
		return this.#pendingStates.delete(key);
	}

	/**
	 * Retrieves the serialized pending state for the specified key.
	 *
	 * @param key - The key to retrieve
	 * @returns The serialized state as a JSON string, or `undefined` if not found
	 */
	get(key: TKey): string | undefined {
		return JSON.stringify(this.#pendingStates.get(key));
	}

	/**
	 * Checks whether a pending state exists for the specified key.
	 */
	has(key: TKey): boolean {
		return this.#pendingStates.has(key);
	}

	/**
	 * Stores a pending state from `container.getPendingLocalState()`.
	 *
	 * @param key - The key to associate with the state
	 * @param pendingLocalState - String returned by `getPendingLocalState()` from an attached container
	 * @returns This store instance for method chaining
	 *
	 * @throws When storing states from different container URLs
	 */
	set(key: TKey, pendingLocalState: string): this {
		const state = getAttachedContainerStateFromSerializedContainer(pendingLocalState);
		const { savedOps, snapshotBlobs, loadedGroupIdSnapshots, url } = state;

		this.#firstUrl ??= url;
		if (this.#firstUrl !== url) {
			throw new UsageError("PendingLocalStateStore can only be used with a single container.");
		}

		for (let i = 0; i < savedOps.length; i++) {
			savedOps[i] = this.#savedOps[savedOps[i].sequenceNumber] ??= savedOps[i];
		}
		for (const [id, blob] of Object.entries(snapshotBlobs)) {
			snapshotBlobs[id] = this.#blobs[id] ??= blob;
		}
		if (loadedGroupIdSnapshots !== undefined) {
			for (const [id, lg] of Object.entries(loadedGroupIdSnapshots)) {
				if (
					this.#loadingGroups[id] === undefined ||
					lg.snapshotSequenceNumber < this.#loadingGroups[id].snapshotSequenceNumber
				) {
					loadedGroupIdSnapshots[id] = this.#loadingGroups[id] = lg;
				}
			}
		}

		this.#pendingStates.set(key, state);
		return this;
	}

	/**
	 * Gets the number of stored pending states.
	 */
	get size(): number {
		return this.#pendingStates.size;
	}

	/**
	 * Returns an iterator over [key, serializedState] pairs.
	 */
	entries(): Iterator<[TKey, string]> {
		const iterator = this.#pendingStates.entries();
		return {
			next: (): IteratorResult<[TKey, string]> => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const { done, value } = iterator.next();
				if (done === true) {
					return { done, value: undefined };
				}
				return { done, value: [value[0], JSON.stringify(value[1])] };
			},
		};
	}

	/**
	 * Returns an iterator over the stored keys.
	 */
	keys(): IterableIterator<TKey> {
		return this.#pendingStates.keys();
	}

	/**
	 * Makes the store iterable with `for...of` loops.
	 */
	[Symbol.iterator](): Iterator<[TKey, string]> {
		return this.entries();
	}
}
