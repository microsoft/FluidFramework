/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createIdCompressor } from "@fluidframework/id-compressor";
import { DetachedFieldIndex, ForestRootId } from "../../core";
import { IdAllocator, idAllocatorFromMaxId } from "../../util";
import { typeboxValidator } from "../../external-utilities";

const wellFormedIdCompressor = createIdCompressor();
const mintedTag = wellFormedIdCompressor.generateCompressedId();
wellFormedIdCompressor.finalizeCreationRange(wellFormedIdCompressor.takeNextCreationRange());
const finalizedTag = wellFormedIdCompressor.normalizeToOpSpace(mintedTag);

const malformedIdCompressor = createIdCompressor();

const malformedData: [string, string][] = [
	[
		"missing data",
		JSON.stringify({
			version: 1,
			maxId: -1,
		}),
	],
	[
		"incorrect version",
		JSON.stringify({
			version: 2,
			data: [],
			maxId: -1,
		}),
	],
	[
		"additional piece of data in entry",
		JSON.stringify({
			version: 1,
			data: [[1, 2, 3, 4]],
			maxId: -1,
		}),
	],
	[
		"incorrect data type",
		JSON.stringify({
			version: 1,
			data: "incorrect data type",
			maxId: -1,
		}),
	],
	[
		"Unfinalized id",
		JSON.stringify({
			version: 1,
			data: [[malformedIdCompressor.generateCompressedId(), 2, 3]],
			maxId: -1
		})
	]
];

const validData: [string, string][] = [
	[
		"empty data",
		JSON.stringify({
			version: 1,
			data: [],
			maxId: -1,
		}),
	],
	[
		"single entry",
		JSON.stringify({
			version: 1,
			data: [[finalizedTag, 2, 3]],
			maxId: -1,
		}),
	],
];
describe("DetachedFieldIndex", () => {
	it("encodes with a version stamp.", () => {
		const detachedFieldIndex = new DetachedFieldIndex(
			"test",
			idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
			wellFormedIdCompressor,
			{ jsonValidator: typeboxValidator },
		);
		const expected = JSON.stringify({
			version: 1,
			data: [],
			maxId: -1,
		});
		assert.equal(detachedFieldIndex.encode(), expected);
	});
	describe("loadData", () => {
		describe("accepts correct data", () => {
			for (const [name, data] of validData) {
				it(`accepts correct data: ${name}`, () => {
					const detachedFieldIndex = new DetachedFieldIndex(
						"test",
						idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
						wellFormedIdCompressor,
						{
							jsonValidator: typeboxValidator,
						},
					);
					detachedFieldIndex.loadData(data);
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
					assert.throws(() => detachedFieldIndex.loadData(data), "Expected malformed data to throw an error on decode, but it did not.");
				});
			}
		});
	});
});
