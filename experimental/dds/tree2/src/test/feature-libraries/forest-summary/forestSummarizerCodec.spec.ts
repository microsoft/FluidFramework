/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { rootFieldKey } from "../../../core";
import { typeboxValidator } from "../../../external-utilities";
import {
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
	makeFieldBatchCodec,
} from "../../../feature-libraries";

import {
	FieldSet,
	makeForestSummarizerCodec,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/forest-summary/codec";
import { emptySchema } from "../../cursorTestSuite";
// eslint-disable-next-line import/no-internal-modules
import { version } from "../../../feature-libraries/forest-summary/format";
// eslint-disable-next-line import/no-internal-modules
import { EncodedFieldBatch } from "../../../feature-libraries/chunked-forest";

const fieldBatchCodec = makeFieldBatchCodec({ jsonValidator: typeboxValidator });
const codecWithContext = makeForestSummarizerCodec(
	{ jsonValidator: typeboxValidator },
	fieldBatchCodec,
);
// Uncompressed
const codec = codecWithContext({ encodeType: TreeCompressionStrategy.Uncompressed });

const testFieldBatch: EncodedFieldBatch = fieldBatchCodec({
	encodeType: TreeCompressionStrategy.Uncompressed,
}).encode([cursorForJsonableTreeField([{ type: emptySchema.name }])]);

const malformedData: [string, any][] = [
	["additional piece of data in entry", [[rootFieldKey, testFieldBatch, "additional data"]]],
	["incorrect data type", ["incorrect data type"]],
	["missing data", [[rootFieldKey]]],
];
const validData: [string, any][] = [
	["single entry", [[rootFieldKey, testFieldBatch]]],
	[
		"multiple entries",
		[
			[rootFieldKey, testFieldBatch],
			[rootFieldKey, testFieldBatch],
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
				assert.throws(() => codec.encode(data as unknown as FieldSet), "malformed data");
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
						} as unknown as FieldSet),
					"malformed data",
				);
			});
		}
		it("invalid version", () => {
			assert.throws(
				() =>
					codec.encode({
						version: 2.0,
						data: [[rootFieldKey, testFieldBatch]],
					} as unknown as FieldSet),
				"malformed data",
			);
		});
	});
});
