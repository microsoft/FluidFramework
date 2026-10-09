/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Static } from "typebox";
import * as Type from "typebox/type";

import { extractJsonValidator } from "../../codec/index.js";
import { EncodedJsonableTree } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	stringKeyRecord,
	typeboxInterface,
	typeboxOptional,
	typeboxReadonly,
	type areSafelyAssignable,
	type requireTrue,
} from "../../util/index.js";

describe("TypeBox helpers", () => {
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
