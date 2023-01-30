/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import {
	AttributionCollection as NewAttributionCollection,
	IAttributionCollection,
	SerializedAttributionCollection,
} from "../attributionCollection";
import { TextSegmentGranularity } from "../textSegment";
import { AttributionKey, compareNumbers, ISegment } from "../mergeTreeNodes";
import { RedBlackTree } from "../collections";

interface IAttributionCollectionCtor {
	new (key: AttributionKey, length: number): IAttributionCollection<AttributionKey>;

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
	const singleKeyCollection = new ctor({ type: "op", seq: 5 }, 42);
	const tenKeyCollection = new ctor({ type: "op", seq: 0 }, 2);
	for (let i = 1; i < 10; i++) {
		tenKeyCollection.append(new ctor({ type: "op", seq: i }, i * 3));
	}
	const maxSizeCollection = new ctor({ type: "op", seq: 0 }, 1);
	for (let i = 1; i < TextSegmentGranularity; i++) {
		maxSizeCollection.append(new ctor({ type: "op", seq: i }, 1));
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
		benchmarkFn: () => new ctor({ type: "op", seq: 5 }, 42),
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

export class TreeAttributionCollection implements IAttributionCollection<AttributionKey> {
	private readonly entries: RedBlackTree<number, number> = new RedBlackTree(compareNumbers);

	public constructor({ seq }: AttributionKey, private _length: number) {
		this.entries.put(0, seq);
	}

	public getAtOffset(offset: number): AttributionKey {
		assert(offset >= 0 && offset < this._length, 0x443 /* Requested offset should be valid */);
		const node = this.entries.floor(offset);
		assert(node !== undefined, 0x444 /* Collection should have at least one entry */);
		return { type: "op", seq: node.data };
	}

	public get length(): number {
		return this._length;
	}

	/**
	 * Splits this attribution collection into two with entries for [0, pos) and [pos, length).
	 */
	public splitAt(pos: number): TreeAttributionCollection {
		const splitBaseEntry = this.getAtOffset(pos);
		const splitCollection = new TreeAttributionCollection(splitBaseEntry, this.length - pos);
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
		const lastEntry = this.getAtOffset(this.length - 1).seq;
		other.entries.map(({ key, data }) => {
			if (key !== 0 || lastEntry !== data) {
				this.entries.put(key + this.length, data);
			}
			return true;
		});
		this._length += other.length;
	}

	public getAll(): { offset: number; key: AttributionKey }[] {
		const results: { offset: number; key: AttributionKey }[] = [];
		this.entries.map(({ key, data }) => {
			results.push({ offset: key, key: { type: "op", seq: data } });
			return true;
		});
		return results;
	}

	public clone(): TreeAttributionCollection {
		const copy = new TreeAttributionCollection(this.getAtOffset(0), this.length);
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
			0x445 /* Invalid attribution summary blob provided */,
		);
		let curIndex = 0;
		let cumulativeSegPos = 0;
		let currentInfo = seqs[curIndex];

		for (const segment of segments) {
			const attribution = new TreeAttributionCollection(
				{ type: "op", seq: currentInfo },
				segment.cachedLength,
			);
			while (posBreakpoints[curIndex] < cumulativeSegPos + segment.cachedLength) {
				currentInfo = seqs[curIndex];
				attribution.entries.put(posBreakpoints[curIndex] - cumulativeSegPos, currentInfo);
				curIndex++;
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
		const seqs: number[] = [];
		let mostRecentAttributionKey: number | undefined;
		let cumulativePos = 0;

		let segmentsWithAttribution = 0;
		let segmentsWithoutAttribution = 0;
		for (const segment of segments) {
			if (segment.attribution) {
				segmentsWithAttribution++;
				for (const { offset, key: info } of segment.attribution?.getAll() ?? []) {
					if (info.seq !== mostRecentAttributionKey) {
						posBreakpoints.push(offset + cumulativePos);
						seqs.push(info.seq);
					}
					mostRecentAttributionKey = info.seq;
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

describe("IAttributionCollection perf", () => {
	describe("tree implementation", () => {
		runAttributionCollectionSuite(TreeAttributionCollection, BenchmarkType.Diagnostic);
	});

	describe("list-based implementation", () => {
		runAttributionCollectionSuite(NewAttributionCollection, BenchmarkType.Measurement);
	});
});
