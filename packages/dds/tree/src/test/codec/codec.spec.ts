/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import * as Type from "@sinclair/typebox";

import {
	extractJsonValidator,
	type IJsonCodec,
	withSchemaValidation,
} from "../../codec/index.js";
import {
	FormatValidatorBasic,
	FormatValidatorInterpreted,
} from "../../external-utilities/index.js";

describe("Codec APIs", () => {
	describe("withSchemaValidation", () => {
		const idCodec: IJsonCodec<number, number> = {
			encode: (x) => x,
			decode: (x) => x,
		};
		const codec = withSchemaValidation(Type.Number(), idCodec, FormatValidatorBasic);
		describe("rejects invalid data", () => {
			it("on encode", () => {
				assert.throws(
					() => codec.encode("bad data" as unknown as number),
					validateAssertionError(/Encoded data should validate/),
				);
			});

			it("on decode", () => {
				assert.throws(
					() => codec.decode("bad data" as unknown as number),
					validateAssertionError(/Data being decoded should validate/),
				);
			});

			it("using a per-call custom error handler", () => {
				assert.throws(
					() =>
						codec.decode("bad data" as unknown as number, undefined, (message) => {
							throw new UsageError(message ?? "Invalid input");
						}),
					validateUsageError("Encoded data does not match the expected schema."),
				);
				assert.throws(
					() => codec.decode("bad data" as unknown as number),
					validateAssertionError(/Data being decoded should validate/),
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

	describe("FormatValidatorInterpreted", () => {
		it("validates without dynamic code generation", () => {
			const originalFunction = globalThis.Function;
			globalThis.Function = (() => {
				throw new Error("Dynamic code generation is disabled.");
			}) as unknown as FunctionConstructor;

			try {
				const validator = extractJsonValidator(FormatValidatorInterpreted).compile(
					Type.Number(),
				);
				assert.equal(validator.check(42), true);
				assert.equal(validator.check("42"), false);
			} finally {
				globalThis.Function = originalFunction;
			}
		});
	});
});
