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
	stringKeyRecord,
	typeboxInterface,
	type areSafelyAssignable,
	type requireTrue,
} from "../../util/index.js";

describe("TypeBox builders", () => {
	for (const [name, modifier, key] of [
		["optional", Type.Optional, "~optional"],
		["readonly", Type.Readonly, "~readonly"],
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

			it("accepts frozen schemas without changing the input", () => {
				const schema = Object.freeze(
					Type.Object({ value: Type.String() }, { description: "original" }),
				);
				const modified = modifier(schema);

				assert.equal(modified.properties, schema.properties);
				assert.equal(
					Object.getOwnPropertyDescriptor(modified, "description")?.value,
					"original",
				);
				assert.equal(Object.hasOwn(schema, key), false);
				assert.equal(Object.hasOwn(modified, key), true);
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
							assert.equal(Object.isFrozen(modified.properties), immutableTypes);
							assert.equal(Object.isFrozen(modified.properties.value), immutableTypes);
							assert.equal(Object.isFrozen(modified.required), immutableTypes);
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

	it("freezes nested schema containers in immutable mode", () => {
		const settings = { ...Settings.Get() };
		try {
			Settings.Set({ immutableTypes: true });
			const schema = Type.Object({
				nested: Type.Optional(Type.Array(Type.Tuple([Type.String(), Type.Number()]))),
			});
			const array = schema.properties.nested;
			const tuple = array.items;
			for (const container of [
				schema,
				schema.properties,
				array,
				tuple,
				tuple.items,
				...tuple.items,
			]) {
				assert.equal(Object.isFrozen(container), true);
			}
			assert.throws(
				() => Object.assign(schema.properties, { extra: Type.String() }),
				TypeError,
			);
			assert.throws(() => tuple.items.push(Type.String()), TypeError);
		} finally {
			Settings.Set(settings);
		}
	});

	it("composes optional and readonly modifiers in either order", () => {
		const field = Type.Object({ value: Type.String() });
		const optionalReadonly = Type.Optional(Type.Readonly(field));
		const readonlyOptional = Type.Readonly(Type.Optional(field));
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
			optional: Type.Optional(Type.String()),
			readonly: Type.Readonly(Type.Boolean()),
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
					optional: Type.Optional(Type.String()),
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

	it("uses the last inherited property schema and then the explicit property schema", () => {
		const inherited = Type.Object({
			value: Type.Readonly(Type.String()),
			other: Type.Boolean(),
		});
		const optional = Type.Object({ value: Type.Optional(Type.Number()) });
		const inheritedOverride = typeboxInterface([inherited, optional], {});
		const explicitOverride = typeboxInterface([inherited], optional.properties);
		const requiredOverride = typeboxInterface([inherited, optional], {
			value: Type.Boolean(),
		});
		type _InheritedOverride = requireTrue<
			areSafelyAssignable<Static<typeof inheritedOverride>, { other: boolean; value?: number }>
		>;
		type _ExplicitOverride = requireTrue<
			areSafelyAssignable<Static<typeof explicitOverride>, { other: boolean; value?: number }>
		>;
		type _RequiredOverride = requireTrue<
			areSafelyAssignable<Static<typeof requiredOverride>, { other: boolean; value: boolean }>
		>;

		for (const schema of [inheritedOverride, explicitOverride]) {
			assert.equal(schema.properties.value, optional.properties.value);
			const validator = extractJsonValidator(FormatValidatorBasic).compile(schema);
			assert.equal(validator.check({ other: true }), true);
			assert.equal(validator.check({ other: true, value: 1 }), true);
			assert.equal(validator.check({ other: true, value: "text" }), false);
		}
		const requiredValidator =
			extractJsonValidator(FormatValidatorBasic).compile(requiredOverride);
		assert.equal(requiredValidator.check({ other: true }), false);
		assert.equal(requiredValidator.check({ other: true, value: true }), true);
		assert.equal(requiredValidator.check({ other: true, value: 1 }), false);
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
