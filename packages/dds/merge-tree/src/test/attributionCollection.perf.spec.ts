/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";
import type { AttributionKey } from "@fluidframework/runtime-definitions/internal";

import {
	type IAttributionCollection,
	AttributionCollection as NewAttributionCollection,
	type SerializedAttributionCollection,
} from "../attributionCollection.js";
import type { ISegment } from "../mergeTreeNodes.js";
import { TextSegmentGranularity } from "../textSegment.js";

interface IAttributionCollectionCtor {
	new (length: number, key?: AttributionKey): IAttributionCollection<AttributionKey>;

	serializeAttributionCollections(
		segments: Iterable<{
			attribution?: IAttributionCollection<AttributionKey>;
			cachedLength: number;
		}>,
	): SerializedAttributionCollection;

	populateAttributionCollections(
		segments: Iterable<Partial<ISegment>>,
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
			benchmarkIt({
				title: "getAtOffset at the start",
				...benchmarkDuration({ benchmarkFn: () => collection.getAtOffset(0) }),
				type,
			});

			benchmarkIt({
				title: "getAtOffset at the end",
				...benchmarkDuration({ benchmarkFn: () => collection.getAtOffset(length - 1) }),
				type,
			});

			benchmarkIt({
				title: "getAtOffset in the middle",
				...benchmarkDuration({ benchmarkFn: () => collection.getAtOffset(length / 2) }),
				type: BenchmarkType.Diagnostic,
			});

			benchmarkIt({
				title: "getKeysInOffsetRange from start to end",
				...benchmarkDuration({ benchmarkFn: () => collection.getKeysInOffsetRange(0) }),
				type,
			});

			benchmarkIt({
				title: "getKeysInOffsetRange from start to mid",
				...benchmarkDuration({
					benchmarkFn: () => collection.getKeysInOffsetRange(0, length / 2),
				}),
				type,
			});

			benchmarkIt({
				title: "getKeysInOffsetRange from mid to end",
				...benchmarkDuration({
					benchmarkFn: () => collection.getKeysInOffsetRange(length / 2, length - 1),
				}),
				type,
			});

			benchmarkIt({
				title: "getAll",
				...benchmarkDuration({ benchmarkFn: () => collection.getAll() }),
				type,
			});

			benchmarkIt({
				title: "clone",
				...benchmarkDuration({ benchmarkFn: () => collection.clone() }),
				type,
			});

			benchmarkIt({
				title: "split + append in the middle",
				...benchmarkDuration({
					benchmarkFn: () => {
						const split = collection.splitAt(length / 2);
						collection.append(split);
					},
				}),
				type,
			});
		});
	}

	benchmarkIt({
		title: "construction",
		...benchmarkDuration({ benchmarkFn: () => new ctor(42, { type: "op", seq: 5 }) }),
		type: suiteBaseType,
	});

	const segmentsToSerialize = collectionTestCases.map(({ collection }) => ({
		attribution: collection,
		cachedLength: collection.length,
	}));

	benchmarkIt({
		title: "serializing",
		...benchmarkDuration({
			benchmarkFn: () => ctor.serializeAttributionCollections(segmentsToSerialize),
		}),
		type: suiteBaseType,
	});

	const summary = ctor.serializeAttributionCollections(segmentsToSerialize);
	const segments: Partial<ISegment>[] = Array.from({ length: 9 }, () => ({
		cachedLength: Math.floor(summary.length / 10),
	})) as ISegment[];
	segments.push({
		cachedLength: summary.length - 9 * Math.floor(summary.length / 10),
	} satisfies Partial<ISegment>);
	benchmarkIt({
		title: "deserialize into 10 segments",
		...benchmarkDuration({
			benchmarkFn: () => {
				ctor.populateAttributionCollections(segments, summary);
			},
		}),
		type: suiteBaseType,
	});
}

describe("IAttributionCollection perf", () => {
	// There was a RedBlack tree based implementation for the collection entries, but the linear array based one won due to constant
	// factors/memory characteristics, so just kept the array based one.
	describe("list-based implementation", () => {
		runAttributionCollectionSuite(NewAttributionCollection, BenchmarkType.Measurement);
	});
});
