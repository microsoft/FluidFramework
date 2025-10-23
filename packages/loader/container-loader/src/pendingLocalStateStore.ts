import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	IPendingContainerState,
	SerializedSnapshotInfo,
} from "./serializedStateManager.js";
import { getAttachedContainerStateFromSerializedContainer } from "./utils.js";

/**
 * @legacy @alpha
 */
export class PendingLocalStateStore<TKey> {
	#firstUrl: string | undefined;
	readonly #pendingStates = new Map<TKey, IPendingContainerState>();
	readonly #savedOps: Record<number, ISequencedDocumentMessage> = {};
	readonly #blobs: Record<string, string> = {};
	readonly #loadingGroups: Record<string, SerializedSnapshotInfo> = {};

	clear(): void {
		return this.#pendingStates.clear();
	}
	delete(key: TKey): boolean {
		return this.#pendingStates.delete(key);
	}
	get(key: TKey): string | undefined {
		return JSON.stringify(this.#pendingStates.get(key));
	}
	has(key: TKey): boolean {
		return this.#pendingStates.has(key);
	}
	set(key: TKey, value: string): this {
		const state = getAttachedContainerStateFromSerializedContainer(value);
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
	get size(): number {
		return this.#pendingStates.size;
	}
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
	keys(): IterableIterator<TKey> {
		return this.#pendingStates.keys();
	}
	[Symbol.iterator](): Iterator<[TKey, string]> {
		return this.entries();
	}
}
