/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKey, rootFieldKey } from "../../core";
import { typeboxValidator } from "../../external-utilities";
import {
	EncodedChunk,
	cursorForJsonableTreeField,
	uncompressedEncode,
} from "../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { makeForestSummarizerCodec } from "../../feature-libraries/forestSummarizerCodec";
import { emptySchema } from "../cursorTestSuite";
// eslint-disable-next-line import/no-internal-modules
import { version } from "../../feature-libraries/forestSummarizerFormat";

const codec = makeForestSummarizerCodec({ jsonValidator: typeboxValidator });

const testChunk = uncompressedEncode(cursorForJsonableTreeField([{ type: emptySchema.name }]));

const malformedData: [string, any][] = [
	["additional piece of data in entry", [[rootFieldKey, testChunk, "additional data"]]],
	["incorrect data type", ["incorrect data type"]],
	["missing data", [[rootFieldKey]]],
];
const validData: [string, any][] = [
	["single entry", [[rootFieldKey, testChunk]]],
	[
		"multiple entries",
		[
			[rootFieldKey, testChunk],
			[rootFieldKey, testChunk],
		],
	],
];

describe("ForestSummarizerCodec", () => {
	describe("encodes and decodes valid data.", () => {
		for (const [name, data] of validData) {
			it(name, () => {
				const encodedData = codec.encode(data);
				const expected = {
					version,
					data,
				};
				assert.deepEqual(encodedData, expected);

				const decodedData = codec.decode(encodedData);
				assert.deepEqual(decodedData, data);
			});
		}
	});

	describe("throws on receiving malformed data during encode.", () => {
		for (const [name, data] of malformedData) {
			it(name, () => {
				assert.throws(
					() => codec.encode(data as unknown as [FieldKey, EncodedChunk][]),
					"malformed data",
				);
			});
		}
	});

	describe("throws on receiving malformed data during decode.", () => {
		for (const [name, data] of malformedData) {
			it(name, () => {
				assert.throws(
					() =>
						codec.encode({
							version: 1.0,
							data,
						} as unknown as [FieldKey, EncodedChunk][]),
					"malformed data",
				);
			});
		}
		it("invalid version", () => {
			assert.throws(
				() =>
					codec.encode({
						version: 2.0,
						data: [[rootFieldKey, testChunk]],
					} as unknown as [FieldKey, EncodedChunk][]),
				"malformed data",
			);
		});
	});
});
