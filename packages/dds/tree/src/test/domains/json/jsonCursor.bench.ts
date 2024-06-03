/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { BenchmarkType, benchmark, isInPerformanceTestingMode } from "@fluid-tools/benchmark";

import {
	EmptyKey,
	FieldKey,
	ITreeCursor,
	JsonableTree,
	TreeStoredSchemaRepository,
	initializeForest,
	moveToDetachedField,
} from "../../../core/index.js";
import {
	SchemaBuilder,
	cursorToJsonObject,
	jsonRoot,
	jsonSchema,
	singleJsonCursor,
} from "../../../domains/index.js";
import {
	basicChunkTree,
	defaultChunkPolicy,
	makeTreeChunker,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
import {
	buildChunkedForest,
	buildForest,
	cursorForJsonableTreeNode,
	cursorForMapTreeNode,
	defaultSchemaPolicy,
	intoStoredSchema,
	jsonableTreeFromCursor,
	mapTreeFromCursor,
} from "../../../feature-libraries/index.js";
import { brand, JsonCompatible } from "../../../util/index.js";

import { testRevisionTagCodec } from "../../utils.js";
import { averageValues, sum, sumMap } from "./benchmarks.js";
import { Canada, generateCanada } from "./canada.js";
import { CitmCatalog, generateCitmJson } from "./citm.js";
import { clone } from "./jsObjectUtil.js";
import { generateTwitterJsonByByteSize } from "./twitter.js";

// Shared tree keys that map to the type used by the Twitter type/dataset
export const TwitterKey = {
	statuses: brand<FieldKey>("statuses"),
	retweetCount: brand<FieldKey>("retweet_count"),
	favoriteCount: brand<FieldKey>("favorite_count"),
};

/**
 * Performance test suite that measures a variety of access patterns using ITreeCursor.
 */
function bench(
	data: {
		name: string;
		getJson: () => JsonCompatible;
		// Some synthetic workload that invokes this callback with numbers from the data.
		dataConsumer: (cursor: ITreeCursor, calculate: (a: number) => void) => void;
	}[],
) {
	const schemaCollection = new SchemaBuilder({
		scope: "JsonCursor benchmark",
		libraries: [jsonSchema],
	}).intoSchema(SchemaBuilder.optional(jsonRoot));
	const schema = new TreeStoredSchemaRepository(intoStoredSchema(schemaCollection));
	for (const { name, getJson, dataConsumer } of data) {
		describe(name, () => {
			let json: JsonCompatible;
			let encodedTree: JsonableTree;
			before(() => {
				json = getJson();
				encodedTree = jsonableTreeFromCursor(singleJsonCursor(json));
			});

			benchmark({
				type: BenchmarkType.Measurement,
				title: "Clone JS Object",
				before: () => {
					const cloned = clone(json);
					assert.deepEqual(cloned, json, "clone() must return an equivalent tree.");
					assert.notEqual(
						cloned,
						json,
						"clone() must not return the same tree instance.",
					);
				},
				benchmarkFn: () => {
					clone(json);
				},
			});

			const cursorFactories: [string, () => ITreeCursor][] = [
				["JsonCursor", () => singleJsonCursor(json)],
				["TextCursor", () => cursorForJsonableTreeNode(encodedTree)],
				[
					"MapCursor",
					() =>
						cursorForMapTreeNode(
							mapTreeFromCursor(cursorForJsonableTreeNode(encodedTree)),
						),
				],
				[
					"object-forest Cursor",
					() => {
						const forest = buildForest();
						initializeForest(
							forest,
							[cursorForJsonableTreeNode(encodedTree)],
							testRevisionTagCodec,
						);
						const cursor = forest.allocateCursor();
						moveToDetachedField(forest, cursor);
						assert(cursor.firstNode());
						return cursor;
					},
				],
				[
					"BasicChunkCursor",
					() => {
						const input = cursorForJsonableTreeNode(encodedTree);
						const chunk = basicChunkTree(input, defaultChunkPolicy);
						const cursor = chunk.cursor();
						cursor.enterNode(0);
						return cursor;
					},
				],
				[
					"chunked-forest Cursor",
					() => {
						const forest = buildChunkedForest(
							makeTreeChunker(schema, defaultSchemaPolicy),
						);
						initializeForest(
							forest,
							[cursorForJsonableTreeNode(encodedTree)],
							testRevisionTagCodec,
						);
						const cursor = forest.allocateCursor();
						moveToDetachedField(forest, cursor);
						assert(cursor.firstNode());
						return cursor;
					},
				],
			];

			const consumers: [
				string,
				(
					cursor: ITreeCursor,
					dataConsumer: (cursor: ITreeCursor, calculate: (a: number) => void) => unknown,
				) => void,
			][] = [
				["cursorToJsonObject", cursorToJsonObject],
				["jsonableTreeFromCursor", jsonableTreeFromCursor],
				["mapTreeFromCursor", mapTreeFromCursor],
				["sum", sum],
				["sum-map", sumMap],
				["averageValues", averageValues],
			];

			for (const [factoryName, factory] of cursorFactories) {
				describe(factoryName, () => {
					for (const [consumerName, consumer] of consumers) {
						let cursor: ITreeCursor;
						benchmark({
							type: BenchmarkType.Measurement,
							title: `${consumerName}(${factoryName})`,
							before: () => {
								cursor = factory();
								// TODO: validate behavior
								// assert.deepEqual(cursorToJsonObject(cursor), json, "data should round trip through json");
								// assert.deepEqual(
								//     jsonableTreeFromCursor(cursor), encodedTree, "data should round trip through jsonable");
							},
							benchmarkFn: () => {
								consumer(cursor, dataConsumer);
							},
						});
					}
				});
			}
		});
	}
}

const canada = generateCanada(
	// Use the default (large) data set for benchmarking, otherwise use a small dataset.
	isInPerformanceTestingMode ? undefined : [2, 10],
);

function extractCoordinatesFromCanada(cursor: ITreeCursor, calculate: (x: number) => void): void {
	cursor.enterField(Canada.SharedTreeFieldKey.features);
	cursor.enterNode(0);
	cursor.enterField(EmptyKey);
	cursor.enterNode(0);
	cursor.enterField(Canada.SharedTreeFieldKey.geometry);
	cursor.enterNode(0);
	cursor.enterField(Canada.SharedTreeFieldKey.coordinates);
	cursor.enterNode(0);

	cursor.enterField(EmptyKey);

	for (let result = cursor.firstNode(); result; result = cursor.nextNode()) {
		cursor.enterField(EmptyKey);

		for (let resultInner = cursor.firstNode(); resultInner; resultInner = cursor.nextNode()) {
			// Read x and y values
			cursor.enterField(EmptyKey);
			assert.equal(cursor.firstNode(), true, "No X field");
			const x = cursor.value as number;
			assert.equal(cursor.nextNode(), true, "No Y field");
			const y = cursor.value as number;

			cursor.exitNode();
			cursor.exitField();

			calculate(x);
			calculate(y);
		}

		cursor.exitField();
	}

	// Reset the cursor state
	cursor.exitField();
	cursor.exitNode();
	cursor.exitField();
	cursor.exitNode();
	cursor.exitField();
	cursor.exitNode();
	cursor.exitField();
	cursor.exitNode();
	cursor.exitField();
}

function extractAvgValsFromTwitter(
	cursor: ITreeCursor,
	calculate: (x: number, y: number) => void,
): void {
	cursor.enterField(TwitterKey.statuses); // move from root to field
	cursor.enterNode(0); // move from field to node at 0 (which is an object of type array)
	cursor.enterField(EmptyKey); // enter the array field at the node,

	for (let result = cursor.firstNode(); result; result = cursor.nextNode()) {
		cursor.enterField(TwitterKey.retweetCount);
		cursor.enterNode(0);
		const retweetCount = cursor.value as number;
		cursor.exitNode();
		cursor.exitField();

		cursor.enterField(TwitterKey.favoriteCount);
		cursor.enterNode(0);
		const favoriteCount = cursor.value;
		cursor.exitNode();
		cursor.exitField();
		calculate(retweetCount, favoriteCount as number);
	}

	// Reset the cursor state
	cursor.exitField();
	cursor.exitNode();
	cursor.exitField();
}

function extractAvgValsFromCitm(
	cursor: ITreeCursor,
	calculate: (x: number, y: number) => void,
): void {
	cursor.enterField(CitmCatalog.SharedTreeFieldKey.performances);
	cursor.enterNode(0);
	cursor.enterField(EmptyKey);

	// iterate over each performance
	for (
		let performanceIterator = cursor.firstNode();
		performanceIterator;
		performanceIterator = cursor.nextNode()
	) {
		cursor.enterField(CitmCatalog.SharedTreeFieldKey.seatCategories);
		const numSeatCategories = cursor.getFieldLength();
		cursor.exitField();

		cursor.enterField(CitmCatalog.SharedTreeFieldKey.start);
		cursor.enterNode(0);
		const startTimeEpoch = cursor.value as number;
		cursor.exitNode();
		cursor.exitField();

		calculate(numSeatCategories, startTimeEpoch);
	}

	// Reset the cursor state
	cursor.exitField();
	cursor.exitNode();
	cursor.exitField();
}

// The original benchmark twitter.json is 466906 Bytes according to getSizeInBytes.
const twitter = generateTwitterJsonByByteSize(isInPerformanceTestingMode ? 2500000 : 466906, true);
// The original benchmark citm_catalog.json 500299 Bytes according to getSizeInBytes.
const citm = isInPerformanceTestingMode
	? generateCitmJson(2, 2500000)
	: generateCitmJson(1, 500299);
describe("ITreeCursor", () => {
	bench([
		{
			name: "canada",
			getJson: () => canada as unknown as JsonCompatible,
			dataConsumer: (cursor) => averageValues(cursor, extractCoordinatesFromCanada),
		},
	]);
	bench([
		{
			name: "twitter",
			getJson: () => twitter as unknown as JsonCompatible,
			dataConsumer: extractAvgValsFromTwitter,
		},
	]);
	bench([
		{
			name: "citm",
			getJson: () => citm as unknown as JsonCompatible,
			dataConsumer: extractAvgValsFromCitm,
		},
	]);
});
