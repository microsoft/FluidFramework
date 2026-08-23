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

interface SharedResource<T> {
	readonly value: T;
	references: number;
}

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
	readonly #savedOps = new Map<number, SharedResource<ISequencedDocumentMessage>>();
	readonly #blobs = new Map<string, SharedResource<string>>();
	readonly #snapshotBlobContents = new Map<string, SharedResource<string>>();
	readonly #attachmentBlobs = new Map<string, SharedResource<string>>();
	readonly #loadingGroups = new Map<string, SerializedSnapshotInfo>();

	/**
	 * Removes all stored pending states.
	 */
	clear(): void {
		this.#pendingStates.clear();
		this.#firstUrl = undefined;
		this.#resetSharedResources();
	}

	/**
	 * Removes the pending state for the specified key.
	 *
	 * @param key - The key to remove
	 * @returns `true` if the state existed and was removed, `false` otherwise
	 */
	delete(key: TKey): boolean {
		const state = this.#pendingStates.get(key);
		if (state === undefined) {
			return false;
		}
		this.#releaseState(state);
		this.#pendingStates.delete(key);
		this.#rebuildLoadingGroups();
		if (this.#pendingStates.size === 0) {
			this.#firstUrl = undefined;
		}
		return true;
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
		const { url } = state;

		// Normalize URL by removing trailing slash for comparison
		const normalizedUrl = url.replace(/\/$/, "");
		const normalizedFirstUrl = this.#firstUrl?.replace(/\/$/, "");
		if (normalizedFirstUrl !== undefined && normalizedFirstUrl !== normalizedUrl) {
			throw new UsageError("PendingLocalStateStore can only be used with a single container.");
		}

		const existingState = this.#pendingStates.get(key);
		if (existingState !== undefined) {
			this.#releaseState(existingState);
			this.#pendingStates.delete(key);
			this.#rebuildLoadingGroups();
		}
		this.#firstUrl ??= url;
		this.#deduplicateState(state);
		this.#pendingStates.set(key, state);
		return this;
	}

	#deduplicateState(state: IPendingContainerState): void {
		const {
			savedOps,
			snapshotBlobs,
			snapshotBlobContents,
			attachmentBlobContents,
			loadedGroupIdSnapshots,
		} = state;
		for (let i = 0; i < savedOps.length; i++) {
			savedOps[i] = this.#retainSharedResource(
				this.#savedOps,
				savedOps[i].sequenceNumber,
				savedOps[i],
			);
		}
		for (const [id, blob] of Object.entries(snapshotBlobs)) {
			snapshotBlobs[id] = this.#retainSharedResource(this.#blobs, id, blob);
		}
		if (snapshotBlobContents !== undefined) {
			for (const [id, blob] of Object.entries(snapshotBlobContents)) {
				snapshotBlobContents[id] = this.#retainSharedResource(
					this.#snapshotBlobContents,
					id,
					blob,
				);
			}
		}
		if (attachmentBlobContents !== undefined) {
			for (const [id, blob] of Object.entries(attachmentBlobContents)) {
				attachmentBlobContents[id] = this.#retainSharedResource(
					this.#attachmentBlobs,
					id,
					blob,
				);
			}
		}
		this.#deduplicateLoadingGroups(loadedGroupIdSnapshots);
	}

	#deduplicateLoadingGroups(
		loadedGroupIdSnapshots: Record<string, SerializedSnapshotInfo> | undefined,
	): void {
		if (loadedGroupIdSnapshots !== undefined) {
			for (const [id, lg] of Object.entries(loadedGroupIdSnapshots)) {
				const existing = this.#loadingGroups.get(id);
				if (
					existing === undefined ||
					lg.snapshotSequenceNumber < existing.snapshotSequenceNumber
				) {
					loadedGroupIdSnapshots[id] = lg;
					this.#loadingGroups.set(id, lg);
				}
			}
		}
	}

	#retainSharedResource<TKey2, TValue>(
		resources: Map<TKey2, SharedResource<TValue>>,
		key: TKey2,
		value: TValue,
	): TValue {
		const shared = resources.get(key);
		if (shared === undefined) {
			resources.set(key, { value, references: 1 });
			return value;
		}
		shared.references++;
		return shared.value;
	}

	#releaseState(state: IPendingContainerState): void {
		for (const op of state.savedOps) {
			this.#releaseSharedResource(this.#savedOps, op.sequenceNumber);
		}
		for (const id of Object.keys(state.snapshotBlobs)) {
			this.#releaseSharedResource(this.#blobs, id);
		}
		for (const id of Object.keys(state.snapshotBlobContents ?? {})) {
			this.#releaseSharedResource(this.#snapshotBlobContents, id);
		}
		for (const id of Object.keys(state.attachmentBlobContents ?? {})) {
			this.#releaseSharedResource(this.#attachmentBlobs, id);
		}
	}

	#releaseSharedResource<TKey2, TValue>(
		resources: Map<TKey2, SharedResource<TValue>>,
		key: TKey2,
	): void {
		const shared = resources.get(key);
		if (shared === undefined) {
			return;
		}
		shared.references--;
		if (shared.references === 0) {
			resources.delete(key);
		}
	}

	#rebuildLoadingGroups(): void {
		this.#loadingGroups.clear();
		for (const state of this.#pendingStates.values()) {
			this.#deduplicateLoadingGroups(state.loadedGroupIdSnapshots);
		}
	}

	#resetSharedResources(): void {
		for (const resources of [
			this.#savedOps,
			this.#blobs,
			this.#snapshotBlobContents,
			this.#attachmentBlobs,
			this.#loadingGroups,
		]) {
			resources.clear();
		}
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
