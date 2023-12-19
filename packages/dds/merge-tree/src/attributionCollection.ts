/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	AttributionKey,
	OpAttributionKey,
	DetachedAttributionKey,
} from "@fluidframework/runtime-definitions";
import { ISegment } from "./mergeTreeNodes";

/**
 * @alpha
 */
export interface SequenceOffsets {
	/**
	 * Parallel array with posBreakpoints which tracks the seq of insertion.
	 *
	 * @example
	 *
	 * If seqs is [45, 46] and posBreakpoints is [0, 3], the section of the string
	 * between offsets 0 and 3 was inserted at seq 45 and the section of the string between
	 * 3 and the length of the string was inserted at seq 46.
	 *
	 * @remarks We use null here rather than undefined as round-tripping through JSON converts
	 * undefineds to null anyway
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	seqs: (number | AttributionKey | null)[];
	posBreakpoints: number[];
}

/**
 * @alpha
 */
export interface SerializedAttributionCollection extends SequenceOffsets {
	channels?: { [name: string]: SequenceOffsets };
	/* Total length; only necessary for validation */
	length: number;
}

/**
 * @alpha
 */
export interface IAttributionCollectionSpec<T> {
	// eslint-disable-next-line @rushstack/no-new-null
	root: Iterable<{ offset: number; key: T | null }>;
	// eslint-disable-next-line @rushstack/no-new-null
	channels?: { [name: string]: Iterable<{ offset: number; key: T | null }> };
	length: number;
}

/**
 * @alpha
 * @sealed
 */
export interface IAttributionCollectionSerializer {
	/***/
	serializeAttributionCollections(
		segments: Iterable<{
			attribution?: IAttributionCollection<AttributionKey>;
			cachedLength: number;
		}>,
	): SerializedAttributionCollection;

	/**
	 * Populates attribution information on segments using the provided summary.
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
	 * @param channel - When specified, gets an attribution key associated with a particular channel.
	 */
	getAtOffset(offset: number, channel?: string): AttributionKey | undefined;

	/**
	 * Total length of all attribution keys in this collection.
	 */
	readonly length: number;

	readonly channelNames: Iterable<string>;

	/**
	 * Retrieve all key/offset pairs stored on this segment. Entries should be ordered by offset, such that
	 * the `i`th result's attribution key applies to offsets in the open range between the `i`th offset and the
	 * `i+1`th offset.
	 * The last entry's key applies to the open interval from the last entry's offset to this collection's length.
	 */
	getAll(): IAttributionCollectionSpec<T>;

	/***/
	splitAt(pos: number): IAttributionCollection<T>;

	/***/
	append(other: IAttributionCollection<T>): void;

	/***/
	clone(): IAttributionCollection<T>;

	/**
	 * Updates this collection with new attribution data.
	 * @param name - Name of the channel that requires an update. Undefined signifies the root channel.
	 * Updates apply only to the individual channel (i.e. if an attribution policy needs to update the root
	 * channel and 4 other channels, it should call `.update` 5 times).
	 * @param channel - Updated collection for that channel.
	 */
	update(name: string | undefined, channel: IAttributionCollection<T>): void;
}

// note: treats null and undefined as equivalent
export function areEqualAttributionKeys(
	// eslint-disable-next-line @rushstack/no-new-null
	a: AttributionKey | null | undefined,
	// eslint-disable-next-line @rushstack/no-new-null
	b: AttributionKey | null | undefined,
): boolean {
	if (!a && !b) {
		return true;
	}

	if (!a || !b) {
		return false;
	}

	if (a.type !== b.type) {
		return false;
	}

	// Note: TS can't narrow the type of b inside this switch statement, hence the need for casting.
	switch (a.type) {
		case "op":
			return a.seq === (b as OpAttributionKey).seq;
		case "detached":
			return a.id === (b as DetachedAttributionKey).id;
		case "local":
			return true;
		default:
			unreachableCase(a, "Unhandled AttributionKey type");
	}
}

export class AttributionCollection implements IAttributionCollection<AttributionKey> {
	private offsets: number[] = [];
	private keys: (AttributionKey | null)[] = [];

	private channels?: { [name: string]: AttributionCollection };

	private get channelEntries(): [string, AttributionCollection][] {
		return Object.entries(this.channels ?? {});
	}

	public constructor(
		private _length: number,
		// eslint-disable-next-line @rushstack/no-new-null
		baseEntry?: AttributionKey | null,
	) {
		if (baseEntry !== undefined) {
			this.offsets.push(0);
			this.keys.push(baseEntry);
		}
	}

	public get channelNames(): string[] {
		return Object.keys(this.channels ?? {});
	}

	public getAtOffset(offset: number): AttributionKey;
	public getAtOffset(offset: number, channel: string): AttributionKey | undefined;
	public getAtOffset(offset: number, channel?: string): AttributionKey | undefined {
		if (channel !== undefined) {
			const subCollection = this.channels?.[channel];
			return subCollection?.getAtOffset(offset);
		}
		assert(offset >= 0 && offset < this._length, 0x443 /* Requested offset should be valid */);
		return this.get(this.findIndex(offset));
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

	private get(index: number): AttributionKey | undefined {
		const key = this.keys[index];
		return key ?? undefined;
	}

	public get length(): number {
		return this._length;
	}

	/**
	 * Splits this attribution collection into two with entries for [0, pos) and [pos, length).
	 */
	public splitAt(pos: number): AttributionCollection {
		const splitIndex = this.findIndex(pos);
		const splitCollection = new AttributionCollection(this.length - pos);
		for (let i = splitIndex; i < this.keys.length; i++) {
			splitCollection.offsets.push(Math.max(this.offsets[i] - pos, 0));
			splitCollection.keys.push(this.keys[i]);
		}

		if (this.channels) {
			splitCollection.channels = {};
			for (const [key, collection] of this.channelEntries) {
				splitCollection.channels[key] = collection.splitAt(pos);
			}
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

		if (other.channels !== undefined || this.channels !== undefined) {
			this.channels ??= {};
			for (const [key, collection] of other.channelEntries) {
				const thisCollection = (this.channels[key] ??= new AttributionCollection(
					this.length,
					null,
				));
				thisCollection.append(collection);
			}
			for (const [key, collection] of this.channelEntries) {
				if (other.channels?.[key] === undefined) {
					collection.append(new AttributionCollection(other.length, null));
				}
			}
		}
		this._length += other.length;
	}

	public getAll(): IAttributionCollectionSpec<AttributionKey> {
		type ExtractGeneric<T> = T extends Iterable<infer Q> ? Q : unknown;
		const root: ExtractGeneric<IAttributionCollectionSpec<AttributionKey>["root"]>[] =
			new Array(this.keys.length);
		for (let i = 0; i < this.keys.length; i++) {
			root[i] = { offset: this.offsets[i], key: this.keys[i] };
		}
		const result: IAttributionCollectionSpec<AttributionKey> = {
			root,
			length: this.length,
		};
		if (this.channels !== undefined) {
			result.channels = {};
			for (const [key, collection] of this.channelEntries) {
				result.channels[key] = collection.getAll().root;
			}
		}
		return result;
	}

	public clone(): AttributionCollection {
		const copy = new AttributionCollection(this.length);
		copy.keys = this.keys.slice();
		copy.offsets = this.offsets.slice();
		if (this.channels !== undefined) {
			const channelsCopy: Record<string, AttributionCollection> = {};
			for (const [key, collection] of this.channelEntries) {
				channelsCopy[key] = collection.clone();
			}
			copy.channels = channelsCopy;
		}
		return copy;
	}

	public update(name: string | undefined, channel: AttributionCollection) {
		assert(
			channel.length === this.length,
			0x5c0 /* AttributionCollection channel update should have consistent segment length */,
		);
		if (name === undefined) {
			this.offsets = [...channel.offsets];
			this.keys = [...channel.keys];
		} else {
			this.channels ??= {};
			if (this.channels[name] !== undefined) {
				this.channels[name].update(undefined, channel);
			} else {
				this.channels[name] = channel;
			}
		}
	}

	/**
	 * Rehydrates attribution information from its serialized form into the provided iterable of consecutive segments.
	 */
	public static populateAttributionCollections(
		segments: ISegment[],
		summary: SerializedAttributionCollection,
	): void {
		const { channels } = summary;
		assert(
			summary.seqs.length === summary.posBreakpoints.length,
			0x445 /* Invalid attribution summary blob provided */,
		);

		const extractOntoSegments = (
			{ seqs, posBreakpoints }: SequenceOffsets,
			assignToSegment: (collection: AttributionCollection, segment: ISegment) => void,
		) => {
			let curIndex = 0;
			let cumulativeSegPos = 0;

			for (const segment of segments) {
				const attribution = new AttributionCollection(segment.cachedLength);
				const pushEntry = (offset: number, seq: AttributionKey | number | null) => {
					attribution.offsets.push(offset);
					attribution.keys.push(
						seq === null ? null : typeof seq === "object" ? seq : { type: "op", seq },
					);
				};
				if (posBreakpoints[curIndex] > cumulativeSegPos) {
					curIndex--;
				}

				while (posBreakpoints[curIndex] < cumulativeSegPos + segment.cachedLength) {
					const nextOffset = Math.max(posBreakpoints[curIndex] - cumulativeSegPos, 0);
					pushEntry(nextOffset, seqs[curIndex]);
					curIndex++;
				}

				if (attribution.offsets.length === 0) {
					pushEntry(0, seqs[curIndex - 1]);
				}

				assignToSegment(attribution, segment);
				cumulativeSegPos += segment.cachedLength;
			}
		};

		extractOntoSegments(summary, (collection, segment) => {
			segment.attribution = collection;
		});
		if (channels) {
			for (const [name, collectionSpec] of Object.entries(channels)) {
				extractOntoSegments(collectionSpec, (collection, segment) => {
					// Cast is valid as we just assigned this field above
					((segment.attribution as AttributionCollection).channels ??= {})[name] =
						collection;
				});
			}
		}
	}

	/**
	 * Condenses attribution information on consecutive segments into a `SerializedAttributionCollection`
	 *
	 * Note: this operates on segments rather than attribution collections directly so that it can handle cases
	 * where only some segments have attribution defined.
	 */
	public static serializeAttributionCollections(
		segments: Iterable<{
			attribution?: IAttributionCollection<AttributionKey>;
			cachedLength: number;
		}>,
	): SerializedAttributionCollection {
		const allCollectionSpecs: IAttributionCollectionSpec<AttributionKey>[] = [];

		const allChannelNames = new Set<string>();
		for (const segment of segments) {
			const collection =
				segment.attribution ?? new AttributionCollection(segment.cachedLength, null);
			const spec = collection.getAll();
			allCollectionSpecs.push(spec);
			if (spec.channels) {
				for (const name of Object.keys(spec.channels)) {
					allChannelNames.add(name);
				}
			}
		}

		const extractSequenceOffsets = (
			getSpecEntries: (
				spec: IAttributionCollectionSpec<AttributionKey>,
			) => Iterable<{ offset: number; key: AttributionKey | null }>,
		): SerializedAttributionCollection => {
			const posBreakpoints: number[] = [];
			const seqs: (number | AttributionKey | null)[] = [];
			let mostRecentAttributionKey: AttributionKey | null | undefined;
			let cumulativePos = 0;

			for (const spec of allCollectionSpecs) {
				for (const { offset, key } of getSpecEntries(spec)) {
					assert(
						key?.type !== "local",
						0x5c1 /* local attribution keys should never be put in summaries */,
					);
					if (
						mostRecentAttributionKey === undefined ||
						!areEqualAttributionKeys(key, mostRecentAttributionKey)
					) {
						posBreakpoints.push(offset + cumulativePos);
						seqs.push(!key ? null : key.type === "op" ? key.seq : key);
					}
					mostRecentAttributionKey = key;
				}

				cumulativePos += spec.length;
			}

			return { seqs, posBreakpoints, length: cumulativePos };
		};

		const blobContents = extractSequenceOffsets((spec) => spec.root);
		if (allChannelNames.size > 0) {
			const channels: { [name: string]: SequenceOffsets } = {};
			for (const name of allChannelNames) {
				const { posBreakpoints, seqs } = extractSequenceOffsets(
					(spec) => spec.channels?.[name] ?? [{ offset: 0, key: null }],
				);
				channels[name] = { posBreakpoints, seqs };
			}
			blobContents.channels = channels;
		}

		return blobContents;
	}
}
