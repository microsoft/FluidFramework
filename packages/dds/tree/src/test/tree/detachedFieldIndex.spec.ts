/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import { DetachedFieldIndex, type ForestRootId, RevisionTagCodec } from "../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeDetachedNodeToFieldCodec } from "../../core/tree/detachedFieldIndexCodec.js";
// eslint-disable-next-line import/no-internal-modules
import type { Format } from "../../core/tree/detachedFieldIndexFormat.js";
// eslint-disable-next-line import/no-internal-modules
import type { DetachedFieldSummaryData } from "../../core/tree/detachedFieldIndexTypes.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import {
	type IdAllocator,
	type JsonCompatibleReadOnly,
	brand,
	idAllocatorFromMaxId,
} from "../../util/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../snapshots/index.js";
// eslint-disable-next-line import/no-internal-modules
import { createSnapshotCompressor } from "../snapshots/snapshotTestScenarios.js";
import { testIdCompressor, testRevisionTagCodec } from "../utils.js";

const mintedTag = testIdCompressor.generateCompressedId();
const finalizedTag = testIdCompressor.normalizeToOpSpace(mintedTag);

const malformedIdCompressor = createIdCompressor();
const malformedRevisionTagCodec = new RevisionTagCodec(malformedIdCompressor);

const malformedData: [string, JsonCompatibleReadOnly][] = [
	[
		"missing data",
		{
			version: 1,
			maxId: -1,
		},
	],
	[
		"incorrect version",
		{
			version: 2,
			data: [],
			maxId: -1,
		},
	],
	[
		"additional piece of data in entry",
		{
			version: 1,
			data: [[1, 2, 3, 4]],
			maxId: -1,
		},
	],
	[
		"incorrect data type",
		{
			version: 1,
			data: "incorrect data type",
			maxId: -1,
		},
	],
	[
		"a string",
		JSON.stringify({
			version: 1,
			data: [],
			maxId: -1,
		}),
	],
	[
		"Unfinalized id",
		{
			version: 1,
			data: [[malformedIdCompressor.generateCompressedId(), 2, 3]],
			maxId: -1,
		},
	],
];

const validData: [string, Format][] = [
	[
		"empty data",
		{
			version: 1,
			data: [],
			maxId: brand(-1),
		},
	],
	[
		"revision with a single entry",
		{
			version: 1,
			data: [[brand(finalizedTag), 0, brand(1)]],
			maxId: brand(-1),
		},
	],
	[
		"revision with multiple entries",
		{
			version: 1,
			data: [
				[
					brand(finalizedTag),
					[
						[1, brand(0)],
						[0, brand(1)],
					],
				],
			],
			maxId: brand(-1),
		},
	],
];

export function generateTestCases(
	idCompressor: IIdCompressor,
): { name: string; data: DetachedFieldSummaryData }[] {
	const revision = idCompressor.generateCompressedId();
	const maxId: ForestRootId = brand(42);
	return [
		{
			name: "empty",
			data: {
				maxId,
				data: new Map(),
			},
		},
		{
			name: "single range with single node",
			data: {
				maxId,
				data: new Map([[revision, new Map([[0, { root: 1 }]])]]),
			},
		},
		{
			name: "multiple nodes that do not form a single range",
			data: {
				maxId,
				data: new Map([
					[
						revision,
						new Map([
							[2, { root: 1 }],
							[0, { root: 2 }],
							[1, { root: 4 }],
						]),
					],
				]),
			},
		},
		{
			name: "multiple nodes that form ranges",
			data: {
				maxId,
				data: new Map([
					[
						revision,
						new Map([
							[1, { root: 2 }],
							[3, { root: 4 }],
							[2, { root: 3 }],
							[7, { root: 6 }],
							[6, { root: 5 }],
						]),
					],
				]),
			},
		},
	];
}

describe("DetachedFieldIndex", () => {
	it("encodes with a version stamp.", () => {
		const detachedFieldIndex = new DetachedFieldIndex(
			"test",
			idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
			testRevisionTagCodec,
			testIdCompressor,
			{ jsonValidator: typeboxValidator },
		);
		const expected = {
			version: 1,
			data: [],
			maxId: -1,
		};
		assert.deepEqual(detachedFieldIndex.encode(), expected);
	});
	describe("round-trip through JSON", () => {
		const codec = makeDetachedNodeToFieldCodec(
			testRevisionTagCodec,
			{
				jsonValidator: typeboxValidator,
			},
			testIdCompressor,
		);
		for (const { name, data } of generateTestCases(testIdCompressor)) {
			it(name, () => {
				const encoded = codec.encode(data);
				const decoded = codec.decode(encoded);
				assert.deepEqual(decoded, data);
			});
		}
	});
	describe("loadData", () => {
		describe("accepts correct data", () => {
			for (const [name, data] of validData) {
				it(name, () => {
					const detachedFieldIndex = new DetachedFieldIndex(
						"test",
						idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
						testRevisionTagCodec,
						testIdCompressor,
						{
							jsonValidator: typeboxValidator,
						},
					);
					detachedFieldIndex.loadData(data as JsonCompatibleReadOnly);
				});
			}
		});
		describe("throws on receiving malformed data", () => {
			for (const [name, data] of malformedData) {
				it(name, () => {
					const id = idAllocatorFromMaxId() as IdAllocator<ForestRootId>;
					const detachedFieldIndex = new DetachedFieldIndex(
						"test",
						id,
						malformedRevisionTagCodec,
						testIdCompressor,
						{
							jsonValidator: typeboxValidator,
						},
					);
					assert.throws(
						() => detachedFieldIndex.loadData(data),
						"Expected malformed data to throw an error on decode, but it did not.",
					);
				});
			}
		});
	});
	describe("Snapshots", () => {
		useSnapshotDirectory("detached-field-index");
		const snapshotIdCompressor = createSnapshotCompressor();
		const snapshotRevisionTagCodec = new RevisionTagCodec(snapshotIdCompressor);
		const codec = makeDetachedNodeToFieldCodec(
			snapshotRevisionTagCodec,
			{
				jsonValidator: typeboxValidator,
			},
			testIdCompressor,
		);

		const testCases = generateTestCases(snapshotIdCompressor);

		for (const { name, data: change } of testCases) {
			it(name, () => {
				const encoded = codec.encode(change);
				takeJsonSnapshot(encoded as JsonCompatibleReadOnly);
			});
		}
	});
});
