/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	AttributionKey,
	OpAttributionKey,
	DetachedAttributionKey,
} from "@fluidframework/runtime-definitions";
import { AttributionPolicy } from "./mergeTree";
import { Client } from "./client";
import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants";
import {
	MergeTreeDeltaCallback,
	MergeTreeMaintenanceCallback,
	MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback";
import { ISegment } from "./mergeTreeNodes";
import { MergeTreeDeltaType } from "./ops";

/**
 * @internal
 */
export interface SerializedAttributionCollection {
	/**
	 * Parallel array with posBreakpoints which tracks the seq of insertion.
	 * Ex: if seqs is [45, 46] and posBreakpoints is [0, 3], the section of the string
	 * between offsets 0 and 3 was inserted at seq 45 and the section of the string between
	 * 3 and the length of the string was inserted at seq 46.
	 */
	seqs: (number | AttributionKey)[];
	posBreakpoints: number[];
	/* Total length; only necessary for validation */
	length: number;
}

/**
 * @internal
 * @sealed
 */
export interface IAttributionCollectionSerializer {
	/**
	 * @internal
	 */
	serializeAttributionCollections(
		segments: Iterable<{
			attribution?: IAttributionCollection<AttributionKey>;
			cachedLength: number;
		}>,
	): SerializedAttributionCollection;

	/**
	 * Populates attribution information on segments using the provided summary.
	 * @internal
	 */
	populateAttributionCollections(
		segments: Iterable<ISegment>,
		summary: SerializedAttributionCollection,
	): void;
}

/**
 * @alpha
 */
export interface IAttributionCollection<T> {
	/**
	 * Retrieves the attribution key associated with the provided offset.
	 */
	getAtOffset(offset: number): T;

	/**
	 * Total length of all attribution keys in this collection.
	 */
	readonly length: number;

	/**
	 * Retrieve all key/offset pairs stored on this segment. Entries should be ordered by offset, such that
	 * the `i`th result's attribution key applies to offsets in the open range between the `i`th offset and the
	 * `i+1`th offset.
	 * The last entry's key applies to the open interval from the last entry's offset to this collection's length.
	 * @internal
	 */
	getAll(): Iterable<{ offset: number; key: T }>;

	/** @internal */
	splitAt(pos: number): IAttributionCollection<T>;

	/** @internal */
	append(other: IAttributionCollection<T>): void;

	/** @internal */
	clone(): IAttributionCollection<T>;
}

export function areEqualAttributionKeys(a: AttributionKey, b: AttributionKey): boolean {
	if (a.type !== b.type) {
		return false;
	}

	// Note: TS can't narrow the type of b inside this switch statement, hence the need for casting.
	switch (a.type) {
		case "op":
			return a.seq === (b as OpAttributionKey).seq;
		case "detached":
			return a.id === (b as DetachedAttributionKey).id;
		default:
			unreachableCase(a, "Unhandled AttributionKey type");
	}
}

export class AttributionCollection implements IAttributionCollection<AttributionKey> {
	private offsets: number[];
	private keys: AttributionKey[];

	public constructor(baseEntry: AttributionKey, private _length: number) {
		this.offsets = [0];
		this.keys = [baseEntry];
	}

	public getAtOffset(offset: number): AttributionKey {
		assert(offset >= 0 && offset < this._length, 0x443 /* Requested offset should be valid */);
		return this.keys[this.findIndex(offset)];
	}

	private findIndex(offset: number): number {
		// Note: maximum length here is 256 for text segments. Perf testing shows that linear scan beats binary search
		// for attribution collections with under ~64 entries, and even at maximum size (which would require a maximum
		// length segment with every offset having different attribution), getAtOffset is on the order of 100ns.
		let i = 0;
		while (i < this.offsets.length && offset > this.offsets[i]) {
			i++;
		}
		return this.offsets[i] === offset ? i : i - 1;
	}

	public get length(): number {
		return this._length;
	}

	/**
	 * Splits this attribution collection into two with entries for [0, pos) and [pos, length).
	 */
	public splitAt(pos: number): AttributionCollection {
		const splitIndex = this.findIndex(pos);
		const splitBaseEntry = this.keys[splitIndex];
		const splitCollection = new AttributionCollection(splitBaseEntry, this.length - pos);
		for (let i = splitIndex + 1; i < this.keys.length; i++) {
			splitCollection.offsets.push(this.offsets[i] - pos);
			splitCollection.keys.push(this.keys[i]);
		}

		const spliceIndex = this.offsets[splitIndex] === pos ? splitIndex : splitIndex + 1;
		this.keys.splice(spliceIndex);
		this.offsets.splice(spliceIndex);
		this._length = pos;
		return splitCollection;
	}

	public append(other: AttributionCollection): void {
		const lastEntry = this.keys[this.keys.length - 1];
		for (let i = 0; i < other.keys.length; i++) {
			if (i !== 0 || !areEqualAttributionKeys(lastEntry, other.keys[i])) {
				this.offsets.push(other.offsets[i] + this.length);
				this.keys.push(other.keys[i]);
			}
		}
		this._length += other.length;
	}

	public getAll(): { offset: number; key: AttributionKey }[] {
		const results: { offset: number; key: AttributionKey }[] = new Array(this.keys.length);
		for (let i = 0; i < this.keys.length; i++) {
			results[i] = { offset: this.offsets[i], key: this.keys[i] };
		}
		return results;
	}

	public clone(): AttributionCollection {
		const copy = new AttributionCollection(this.keys[0], this.length);
		copy.keys = this.keys.slice();
		copy.offsets = this.offsets.slice();
		return copy;
	}

	/**
	 * Rehydrates attribution information from its serialized form into the provided iterable of consecutive segments.
	 */
	public static populateAttributionCollections(
		segments: Iterable<ISegment>,
		summary: SerializedAttributionCollection,
	): void {
		const { seqs, posBreakpoints } = summary;
		assert(
			seqs.length === posBreakpoints.length && seqs.length > 0,
			0x445 /* Invalid attribution summary blob provided */,
		);
		let curIndex = 0;
		let currentInfo = seqs[curIndex];
		let cumulativeSegPos = 0;

		for (const segment of segments) {
			const attribution = new AttributionCollection(
				typeof currentInfo === "object" ? currentInfo : { type: "op", seq: currentInfo },
				segment.cachedLength,
			);
			while (posBreakpoints[curIndex] < cumulativeSegPos + segment.cachedLength) {
				currentInfo = seqs[curIndex];
				const nextOffset = posBreakpoints[curIndex] - cumulativeSegPos;
				if (attribution.offsets[attribution.offsets.length - 1] !== nextOffset) {
					attribution.offsets.push(nextOffset);
					attribution.keys.push(
						typeof currentInfo === "object"
							? currentInfo
							: { type: "op", seq: currentInfo },
					);
				}
				curIndex++;
			}

			if (posBreakpoints[curIndex] === cumulativeSegPos + segment.cachedLength) {
				currentInfo = seqs[curIndex];
			}

			segment.attribution = attribution;
			cumulativeSegPos += segment.cachedLength;
		}
	}

	/**
	 * Condenses attribution information on consecutive segments into a `SerializedAttributionCollection`
	 */
	public static serializeAttributionCollections(
		segments: Iterable<{
			attribution?: IAttributionCollection<AttributionKey>;
			cachedLength: number;
		}>,
	): SerializedAttributionCollection {
		const posBreakpoints: number[] = [];
		const seqs: (number | AttributionKey)[] = [];
		let mostRecentAttributionKey: AttributionKey | undefined;
		let cumulativePos = 0;

		let segmentsWithAttribution = 0;
		let segmentsWithoutAttribution = 0;
		for (const segment of segments) {
			if (segment.attribution) {
				segmentsWithAttribution++;
				for (const { offset, key } of segment.attribution?.getAll() ?? []) {
					if (
						!mostRecentAttributionKey ||
						!areEqualAttributionKeys(key, mostRecentAttributionKey)
					) {
						posBreakpoints.push(offset + cumulativePos);
						seqs.push(key.type === "op" ? key.seq : key);
					}
					mostRecentAttributionKey = key;
				}
			} else {
				segmentsWithoutAttribution++;
			}

			cumulativePos += segment.cachedLength;
		}

		assert(
			segmentsWithAttribution === 0 || segmentsWithoutAttribution === 0,
			0x446 /* Expected either all segments or no segments to have attribution information. */,
		);

		const blobContents: SerializedAttributionCollection = {
			seqs,
			posBreakpoints,
			length: cumulativePos,
		};
		return blobContents;
	}
}

/**
 * @alpha
 * @returns - An {@link AttributionPolicy} which tracks only insertion of content.
 * Content is only attributed at ack time, unless the container is in a detached state.
 * Detached content is attributed with a {@link @fluidframework/runtime-definitions#DetachedAttributionKey}.
 */
export function createInsertOnlyAttributionPolicy(): AttributionPolicy {
	let unsubscribe: undefined | (() => void);
	return {
		attach: (client: Client) => {
			assert(
				unsubscribe === undefined,
				0x557 /* cannot attach to multiple clients at once */,
			);
			const deltaCallback: MergeTreeDeltaCallback = (
				opArgs,
				{ deltaSegments, operation },
			) => {
				if (operation !== MergeTreeDeltaType.INSERT) {
					return;
				}

				for (const { segment } of deltaSegments) {
					if (segment.seq !== undefined && segment.seq !== UnassignedSequenceNumber) {
						const key: AttributionKey =
							segment.seq === UniversalSequenceNumber
								? { type: "detached", id: 0 }
								: { type: "op", seq: segment.seq };
						segment.attribution ??= new AttributionCollection(
							key,
							segment.cachedLength,
						);
					}
				}
			};

			const maintenanceCallback: MergeTreeMaintenanceCallback = (
				{ deltaSegments, operation },
				opArgs,
			) => {
				if (
					operation !== MergeTreeMaintenanceType.ACKNOWLEDGED ||
					opArgs === undefined ||
					opArgs.op.type !== MergeTreeDeltaType.INSERT
				) {
					return;
				}
				for (const { segment } of deltaSegments) {
					assert(
						segment.seq !== undefined,
						0x558 /* segment.seq should be set after ack. */,
					);
					segment.attribution = new AttributionCollection(
						{ type: "op", seq: segment.seq },
						segment.cachedLength,
					);
				}
			};

			client.on("delta", deltaCallback);
			client.on("maintenance", maintenanceCallback);

			unsubscribe = () => {
				client.off("delta", deltaCallback);
				client.off("maintenance", maintenanceCallback);
			};
		},
		detach: () => {
			unsubscribe?.();
			unsubscribe = undefined;
		},
		get isAttached() {
			return unsubscribe !== undefined;
		},
		serializer: AttributionCollection,
	};
}
