/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import {
	areEqualAttributionKeys,
	AttributionCollection as NewAttributionCollection,
	IAttributionCollection,
	IAttributionCollectionSpec,
	SerializedAttributionCollection,
} from "../attributionCollection";
import { TextSegmentGranularity } from "../textSegment";
import { compareNumbers, ISegment } from "../mergeTreeNodes";
import { RedBlackTree } from "../collections";

interface IAttributionCollectionCtor {
	new (length: number, key?: AttributionKey): IAttributionCollection<AttributionKey>;

	serializeAttributionCollections(
		segments: Iterable<{
			attribution?: IAttributionCollection<AttributionKey>;
			cachedLength: number;
		}>,
	): SerializedAttributionCollection;

	populateAttributionCollections(
		segments: Iterable<ISegment>,
		summary: SerializedAttributionCollection,
	): void;
}

function getCollectionSizes(
	ctor: IAttributionCollectionCtor,
	baseSuiteType: BenchmarkType,
): {
	name: string;
	collection: IAttributionCollection<AttributionKey>;
	type: BenchmarkType;
}[] {
	const singleKeyCollection = new ctor(5, { type: "op", seq: 42 });
	const tenKeyCollection = new ctor(2, { type: "op", seq: 0 });
	for (let i = 1; i < 10; i++) {
		tenKeyCollection.append(new ctor(3 * i, { type: "op", seq: i }));
	}
	const maxSizeCollection = new ctor(1, { type: "op", seq: 0 });
	for (let i = 1; i < TextSegmentGranularity; i++) {
		maxSizeCollection.append(new ctor(1, { type: "op", seq: i }));
	}
	return [
		{ name: "one key", collection: singleKeyCollection, type: BenchmarkType.Diagnostic },
		{ name: "ten keys", collection: tenKeyCollection, type: baseSuiteType },
		{ name: "maximum keys", collection: maxSizeCollection, type: BenchmarkType.Diagnostic },
	];
}

function runAttributionCollectionSuite(
	ctor: IAttributionCollectionCtor,
	suiteBaseType: BenchmarkType,
): void {
	const collectionTestCases = getCollectionSizes(ctor, suiteBaseType);
	for (const { name, collection, type } of collectionTestCases) {
		describe(`using a collection with ${name}`, () => {
			const { length } = collection;
			benchmark({
				title: "getAtOffset at the start",
				benchmarkFn: () => collection.getAtOffset(0),
				type,
			});

			benchmark({
				title: "getAtOffset at the end",
				benchmarkFn: () => collection.getAtOffset(length - 1),
				type,
			});

			benchmark({
				title: "getAtOffset in the middle",
				benchmarkFn: () => collection.getAtOffset(length / 2),
				type: BenchmarkType.Diagnostic,
			});

			benchmark({
				title: "getAll",
				benchmarkFn: () => collection.getAll(),
				type,
			});

			benchmark({
				title: "clone",
				benchmarkFn: () => collection.clone(),
				type,
			});

			benchmark({
				title: "split + append in the middle",
				benchmarkFn: () => {
					const split = collection.splitAt(length / 2);
					collection.append(split);
				},
				type,
			});
		});
	}

	benchmark({
		title: "construction",
		benchmarkFn: () => new ctor(42, { type: "op", seq: 5 }),
		type: suiteBaseType,
	});

	const segmentsToSerialize = collectionTestCases.map(({ collection }) => ({
		attribution: collection,
		cachedLength: collection.length,
	}));

	benchmark({
		title: "serializing",
		benchmarkFn: () => ctor.serializeAttributionCollections(segmentsToSerialize),
		type: suiteBaseType,
	});

	const summary = ctor.serializeAttributionCollections(segmentsToSerialize);
	const segments: ISegment[] = Array.from({ length: 9 }, () => ({
		cachedLength: Math.floor(summary.length / 10),
	})) as ISegment[];
	segments.push({ cachedLength: summary.length - 9 * Math.floor(summary.length / 10) } as any);
	benchmark({
		title: "deserialize into 10 segments",
		benchmarkFn: () => {
			ctor.populateAttributionCollections(segments, summary);
		},
		type: suiteBaseType,
	});
}

// Note: channel functionality is left unimplemented.
class TreeAttributionCollection implements IAttributionCollection<AttributionKey> {
	private readonly entries: RedBlackTree<number, AttributionKey | null> = new RedBlackTree(
		compareNumbers,
	);

	public constructor(
		private _length: number,
		// eslint-disable-next-line @rushstack/no-new-null
		baseEntry?: AttributionKey | null,
	) {
		if (baseEntry !== undefined) {
			this.entries.put(0, baseEntry);
		}
	}

	public get channelNames() {
		return [];
	}

	public getAtOffset(offset: number): AttributionKey | undefined {
		assert(offset >= 0 && offset < this._length, "Requested offset should be valid");
		const node = this.entries.floor(offset);
		assert(node !== undefined, "Collection should have at least one entry");
		return node.data ?? undefined;
	}

	public get length(): number {
		return this._length;
	}

	/**
	 * Splits this attribution collection into two with entries for [0, pos) and [pos, length).
	 */
	public splitAt(pos: number): TreeAttributionCollection {
		const splitBaseEntry = this.getAtOffset(pos);
		const splitCollection = new TreeAttributionCollection(this.length - pos, splitBaseEntry);
		for (
			let current = this.entries.ceil(pos);
			current !== undefined;
			current = this.entries.ceil(pos)
		) {
			// If there happened to be an attribution change at exactly pos, it's already set in the base entry
			if (current.key !== pos) {
				splitCollection.entries.put(current.key - pos, current.data);
			}
			this.entries.remove(current.key);
		}
		this._length = pos;
		return splitCollection;
	}

	public append(other: TreeAttributionCollection): void {
		const lastEntry = this.getAtOffset(this.length - 1);
		other.entries.map(({ key, data }) => {
			if (key !== 0 || !areEqualAttributionKeys(lastEntry, data)) {
				this.entries.put(key + this.length, data);
			}
			return true;
		});
		this._length += other.length;
	}

	public getAll(): IAttributionCollectionSpec<AttributionKey> {
		const results: { offset: number; key: AttributionKey | null }[] = [];
		this.entries.map(({ key, data }) => {
			results.push({ offset: key, key: data });
			return true;
		});
		return { root: results, length: this.length };
	}

	public clone(): TreeAttributionCollection {
		const copy = new TreeAttributionCollection(this.length, this.getAtOffset(0));
		this.entries.map(({ key, data }) => {
			copy.entries.put(key, data);
			return true;
		});
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
			"Invalid attribution summary blob provided",
		);
		let curIndex = 0;
		let cumulativeSegPos = 0;
		let currentInfo = seqs[curIndex];
		const getCurrentKey = () =>
			typeof currentInfo === "object"
				? currentInfo
				: ({ type: "op", seq: currentInfo } as const);

		for (const segment of segments) {
			const attribution = new TreeAttributionCollection(
				segment.cachedLength,
				getCurrentKey(),
			);
			while (posBreakpoints[curIndex] < cumulativeSegPos + segment.cachedLength) {
				currentInfo = seqs[curIndex];
				attribution.entries.put(
					posBreakpoints[curIndex] - cumulativeSegPos,
					getCurrentKey(),
				);
				curIndex++;
			}

			segment.attribution = attribution;
			cumulativeSegPos += segment.cachedLength;
		}
	}

	public update(): void {
		throw new Error("unimplemented");
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
		const seqs: (number | AttributionKey | null)[] = [];
		let mostRecentAttributionKey: AttributionKey | null | undefined;
		let cumulativePos = 0;

		let segmentsWithAttribution = 0;
		let segmentsWithoutAttribution = 0;
		for (const segment of segments) {
			if (segment.attribution) {
				segmentsWithAttribution++;
				for (const { offset, key: info } of segment.attribution?.getAll()?.root ?? []) {
					if (
						mostRecentAttributionKey === undefined ||
						!areEqualAttributionKeys(info, mostRecentAttributionKey)
					) {
						posBreakpoints.push(offset + cumulativePos);
						seqs.push(!info ? null : info.type === "op" ? info.seq : info);
					}
					mostRecentAttributionKey = info;
				}
			} else {
				segmentsWithoutAttribution++;
			}

			cumulativePos += segment.cachedLength;
		}

		assert(
			segmentsWithAttribution === 0 || segmentsWithoutAttribution === 0,
			"Expected either all segments or no segments to have attribution information.",
		);

		const blobContents: SerializedAttributionCollection = {
			seqs,
			posBreakpoints,
			length: cumulativePos,
		};
		return blobContents;
	}
}

describe("IAttributionCollection perf", () => {
	describe("tree implementation", () => {
		runAttributionCollectionSuite(TreeAttributionCollection, BenchmarkType.Diagnostic);
	});

	describe("list-based implementation", () => {
		runAttributionCollectionSuite(NewAttributionCollection, BenchmarkType.Measurement);
	});
});
