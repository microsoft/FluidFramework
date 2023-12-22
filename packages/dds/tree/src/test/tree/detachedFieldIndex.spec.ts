/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DetachedFieldIndex, ForestRootId } from "../../core";
import { IdAllocator, JsonCompatibleReadOnly, brand, idAllocatorFromMaxId } from "../../util";
import { typeboxValidator } from "../../external-utilities";
// eslint-disable-next-line import/no-internal-modules
import { Format } from "../../core/tree/detachedFieldIndexFormat";

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
		"single entry",
		{
			version: 1,
			data: [[1, 2, brand(3)]],
			maxId: brand(-1),
		},
	],
];
describe("DetachedFieldIndex", () => {
	it("encodes with a version stamp.", () => {
		const detachedFieldIndex = new DetachedFieldIndex(
			"test",
			idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
			{ jsonValidator: typeboxValidator },
		);
		const expected = {
			version: 1,
			data: [],
			maxId: -1,
		};
		assert.deepEqual(detachedFieldIndex.encode(), expected);
	});
	describe("loadData", () => {
		describe("accepts correct data", () => {
			for (const [name, data] of validData) {
				it(name, () => {
					const detachedFieldIndex = new DetachedFieldIndex(
						"test",
						idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
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
					const detachedFieldIndex = new DetachedFieldIndex("test", id, {
						jsonValidator: typeboxValidator,
					});
					assert.throws(() => detachedFieldIndex.loadData(data), "malformed data");
				});
			}
		});
	});
});
