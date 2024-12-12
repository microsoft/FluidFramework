/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Type } from "@sinclair/typebox";

import { type IJsonCodec, withSchemaValidation } from "../../codec/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";

describe("Codec APIs", () => {
	describe("withSchemaValidation", () => {
		const idCodec: IJsonCodec<number, number> = {
			encode: (x) => x,
			decode: (x) => x,
		};
		const codec = withSchemaValidation(Type.Number(), idCodec, typeboxValidator);
		describe("rejects invalid data", () => {
			it("on encode", () => {
				assert.throws(
					() => codec.encode("bad data" as unknown as number),
					/Encoded schema should validate/,
				);
			});

			it("on decode", () => {
				assert.throws(
					() => codec.decode("bad data" as unknown as number),
					/Encoded schema should validate/,
				);
			});
		});

		describe("accepts valid data", () => {
			it("on encode", () => {
				assert.equal(codec.encode(0), 0);
				assert.equal(codec.encode(5), 5);
			});

			it("on decode", () => {
				assert.equal(codec.decode(0), 0);
				assert.equal(codec.decode(91), 91);
			});
		});
	});
});
