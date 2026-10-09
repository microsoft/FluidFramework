/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Static } from "typebox";
import { Settings } from "typebox/system";
import * as Type from "typebox/type";

import { extractJsonValidator } from "../../codec/index.js";
import { EncodedJsonableTree } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	brandedIntegerType,
	brandedNumberType,
	type Brand,
	stringKeyRecord,
	typeboxInterface,
	typeboxOptional,
	typeboxReadonly,
	type areSafelyAssignable,
	type requireTrue,
} from "../../util/index.js";

describe("TypeBox helpers", () => {
	describe("brandedIntegerType", () => {
		it("preserves the static brand and rejects non-integers", () => {
			type Id = Brand<number, "test.IntegerId">;
			const schema = brandedIntegerType<Id>();
			type _Brand = requireTrue<areSafelyAssignable<Static<typeof schema>, Id>>;
			const validator = extractJsonValidator(FormatValidatorBasic).compile(schema);

			for (const value of [-1, -0, 0, 1, Number.MAX_SAFE_INTEGER, 1e100]) {
				assert.equal(validator.check(value), true);
			}
			for (const value of [
				0.5,
				1e-11,
				1 - 1e-11,
				1 + 1e-11,
				-1 - 1e-11,
				Number.NaN,
				Infinity,
				-Infinity,
				"1",
				undefined,
			]) {
				assert.equal(validator.check(value), false);
			}
			assert.deepEqual(JSON.parse(JSON.stringify(schema)), { type: "integer" });
		});

		it("preserves numeric bounds", () => {
			const schema = brandedIntegerType({
				minimum: -1,
				maximum: Number.MAX_SAFE_INTEGER,
			});
			const validator = extractJsonValidator(FormatValidatorBasic).compile(schema);
			for (const value of [-1, 0, Number.MAX_SAFE_INTEGER]) {
				assert.equal(validator.check(value), true);
			}
			for (const value of [-2, Number.MAX_SAFE_INTEGER + 1]) {
				assert.equal(validator.check(value), false);
			}
			assert.deepEqual(JSON.parse(JSON.stringify(schema)), {
				type: "integer",
				minimum: -1,
				maximum: Number.MAX_SAFE_INTEGER,
			});
		});

		it("does not restrict general branded numbers to integers", () => {
			const validator = extractJsonValidator(FormatValidatorBasic).compile(
				brandedNumberType(),
			);
			assert.equal(validator.check(0.5), true);
		});
	});

	for (const [name, modifier, key] of [
		["optional", typeboxOptional, "~optional"],
		["readonly", typeboxReadonly, "~readonly"],
	] as const) {
		describe(name, () => {
			it("copies only the outer schema and preserves its metadata", () => {
				const schema = Type.Object({
					nested: Type.Array(Type.Object({ value: Type.String() })),
				});
				const modified = modifier(schema);

				assert.notEqual(modified, schema);
				assert.equal(modified.properties, schema.properties);
				assert.equal(modified.required, schema.required);
				assert.equal(Object.hasOwn(schema, key), false);
				for (const property of Reflect.ownKeys(schema)) {
					assert.deepEqual(
						Object.getOwnPropertyDescriptor(modified, property),
						Object.getOwnPropertyDescriptor(schema, property),
					);
				}
			});

			it("preserves refinement validation", () => {
				const refined = Type.Refine(
					Type.Object({ value: Type.String() }),
					(value) => value.value.length > 0,
				);
				const schema = Type.Object({ field: modifier(refined) });
				const validator = extractJsonValidator(FormatValidatorBasic).compile(schema);

				assert.equal(validator.check({ field: { value: "text" } }), true);
				assert.equal(validator.check({ field: { value: "" } }), false);
				assert.equal(validator.check({ field: { value: 1 } }), false);
			});

			for (const immutableTypes of [false, true]) {
				for (const enumerableKind of [false, true]) {
					it(`respects immutableTypes=${immutableTypes}, enumerableKind=${enumerableKind}`, () => {
						const settings = { ...Settings.Get() };
						try {
							Settings.Set({ immutableTypes, enumerableKind });
							const schema = Type.Object({ value: Type.String() });
							const modified = modifier(schema);
							const repeated = modifier(modified);

							assert.equal(modified.properties, schema.properties);
							assert.equal(Object.isFrozen(modified), immutableTypes);
							assert.equal(Object.isFrozen(repeated), immutableTypes);
							assert.equal(Object.hasOwn(schema, key), false);
							assert.deepEqual(Object.getOwnPropertyDescriptor(modified, key), {
								value: true,
								enumerable: enumerableKind,
								writable: !immutableTypes,
								configurable: !immutableTypes,
							});
							assert.deepEqual(repeated, modified);
						} finally {
							Settings.Set(settings);
						}
					});
				}
			}
		});
	}

	it("composes optional and readonly modifiers in either order", () => {
		const field = Type.Object({ value: Type.String() });
		const optionalReadonly = typeboxOptional(typeboxReadonly(field));
		const readonlyOptional = typeboxReadonly(typeboxOptional(field));
		const schema = Type.Object({ field: optionalReadonly });
		type _Modifiers = requireTrue<
			areSafelyAssignable<Static<typeof schema>, { readonly field?: { value: string } }>
		>;

		for (const modified of [optionalReadonly, readonlyOptional]) {
			assert.equal(modified.properties, field.properties);
			assert.equal(Object.getOwnPropertyDescriptor(modified, "~optional")?.value, true);
			assert.equal(Object.getOwnPropertyDescriptor(modified, "~readonly")?.value, true);
			const validator = extractJsonValidator(FormatValidatorBasic).compile(
				Type.Object({ field: modified }),
			);
			assert.equal(validator.check({}), true);
			assert.equal(validator.check({ field: { value: "text" } }), true);
			assert.equal(validator.check({ field: { value: 1 } }), false);
		}
	});

	it("creates optional and readonly properties", () => {
		const schema = Type.Object({
			optional: typeboxOptional(Type.String()),
			readonly: typeboxReadonly(Type.Boolean()),
		});

		assert.deepEqual(JSON.parse(JSON.stringify(schema)), {
			type: "object",
			required: ["readonly"],
			properties: {
				optional: { type: "string" },
				readonly: { type: "boolean" },
			},
		});
		assert.equal(
			Object.getOwnPropertyDescriptor(schema.properties.optional, "~optional")?.value,
			true,
		);
		assert.equal(
			Object.getOwnPropertyDescriptor(schema.properties.readonly, "~readonly")?.value,
			true,
		);
	});

	it("creates interfaces by merging object properties", () => {
		const schema = typeboxInterface(
			[
				Type.Object({
					inherited: Type.Number(),
					optional: typeboxOptional(Type.String()),
				}),
			],
			{ own: Type.Boolean() },
			{ additionalProperties: false },
		);
		const value: Static<typeof schema> = { inherited: 1, own: true };

		assert.deepEqual(JSON.parse(JSON.stringify(schema)), {
			type: "object",
			required: ["inherited", "own"],
			properties: {
				inherited: { type: "number" },
				optional: { type: "string" },
				own: { type: "boolean" },
			},
			additionalProperties: false,
		});
		assert.equal(
			extractJsonValidator(FormatValidatorBasic).compile(schema).check(value),
			true,
		);
	});

	it("creates records with arbitrary string keys", () => {
		const schema = stringKeyRecord(Type.String());
		const validator = extractJsonValidator(FormatValidatorBasic).compile(schema);

		assert.deepEqual(JSON.parse(JSON.stringify(schema)), {
			type: "object",
			patternProperties: { "^.*$": { type: "string" } },
		});
		assert.equal(validator.check({ a: "x", "": "y" }), true);
		assert.equal(validator.check({ a: 1 }), false);
	});

	it("preserves referenced record value types", () => {
		const schema = Type.Cyclic(
			{
				Value: Type.Object({ value: Type.String() }),
				Records: stringKeyRecord(Type.Ref("Value")),
			},
			"Records",
		);
		type _RecordType = requireTrue<
			areSafelyAssignable<Static<typeof schema>, Record<string, { value: string }>>
		>;
		const validator = extractJsonValidator(FormatValidatorBasic).compile(schema);
		assert.equal(validator.check({ entry: { value: "text" } }), true);
		assert.equal(validator.check({ entry: { value: 1 } }), false);
	});

	it("preserves recursive persisted-tree types", () => {
		type _TreeType = requireTrue<
			areSafelyAssignable<Static<typeof EncodedJsonableTree>, EncodedJsonableTree>
		>;
	});
});
