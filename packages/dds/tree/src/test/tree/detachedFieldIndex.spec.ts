/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IIdCompressor, SessionId, createIdCompressor } from "@fluidframework/id-compressor";
import { DetachedFieldIndex, ForestRootId } from "../../core";
// eslint-disable-next-line import/no-internal-modules
import { DetachedFieldSummaryData } from "../../core/tree/detachedFieldIndexTypes";
import { IdAllocator, JsonCompatibleReadOnly, brand, idAllocatorFromMaxId } from "../../util";
import { typeboxValidator } from "../../external-utilities";
// eslint-disable-next-line import/no-internal-modules
import { Format } from "../../core/tree/detachedFieldIndexFormat";
// eslint-disable-next-line import/no-internal-modules
import { makeDetachedNodeToFieldCodec } from "../../core/tree/detachedFieldIndexCodec";
import { takeJsonSnapshot, useSnapshotDirectory } from "../snapshots";
import { MockIdCompressor } from "../utils";

const wellFormedIdCompressor = createIdCompressor();
const mintedTag = wellFormedIdCompressor.generateCompressedId();
wellFormedIdCompressor.finalizeCreationRange(wellFormedIdCompressor.takeNextCreationRange());
const finalizedTag = wellFormedIdCompressor.normalizeToOpSpace(mintedTag);

const malformedIdCompressor = createIdCompressor();

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
		"non-empty data",
		{
			version: 1,
			data: [
				[
					[
						[1, brand(0)],
						[0, brand(1)],
					],
					brand(finalizedTag),
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
				data: new Map([[revision, new Map([[0, 1]])]]),
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
							[2, 1],
							[0, 2],
							[1, 4],
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
							[1, 2],
							[3, 4],
							[2, 3],
							[7, 6],
							[6, 5],
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
			new MockIdCompressor(),
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
		const codec = makeDetachedNodeToFieldCodec(wellFormedIdCompressor, {
			jsonValidator: typeboxValidator,
		});
		for (const { name, data } of generateTestCases(wellFormedIdCompressor)) {
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
						wellFormedIdCompressor,
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
						malformedIdCompressor,
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
		const snapshotIdCompressor = createIdCompressor(
			"beefbeef-beef-4000-8000-000000000001" as SessionId,
		);
		const codec = makeDetachedNodeToFieldCodec(snapshotIdCompressor, {
			jsonValidator: typeboxValidator,
		});

		const testCases = generateTestCases(snapshotIdCompressor);
		snapshotIdCompressor.finalizeCreationRange(snapshotIdCompressor.takeNextCreationRange());

		for (const { name, data: change } of testCases) {
			it(name, () => {
				const encoded = codec.encode(change);
				takeJsonSnapshot(encoded as JsonCompatibleReadOnly);
			});
		}
	});
});
