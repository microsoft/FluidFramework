/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import { AttributionKey } from "@fluidframework/runtime-definitions/internal";

import {
	IAttributionCollection,
	AttributionCollection as NewAttributionCollection,
	SerializedAttributionCollection,
} from "../attributionCollection.js";
import { ISegment } from "../mergeTreeNodes.js";
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
				title: "getKeysInOffsetRange from start to end",
				benchmarkFn: () => collection.getKeysInOffsetRange(0),
				type,
			});

			benchmark({
				title: "getKeysInOffsetRange from start to mid",
				benchmarkFn: () => collection.getKeysInOffsetRange(0, length / 2),
				type,
			});

			benchmark({
				title: "getKeysInOffsetRange from mid to end",
				benchmarkFn: () => collection.getKeysInOffsetRange(length / 2, length - 1),
				type,
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
	const segments: Partial<ISegment>[] = Array.from({ length: 9 }, () => ({
		cachedLength: Math.floor(summary.length / 10),
	})) as ISegment[];
	segments.push({
		cachedLength: summary.length - 9 * Math.floor(summary.length / 10),
	} satisfies Partial<ISegment>);
	benchmark({
		title: "deserialize into 10 segments",
		benchmarkFn: () => {
			ctor.populateAttributionCollections(segments, summary);
		},
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
