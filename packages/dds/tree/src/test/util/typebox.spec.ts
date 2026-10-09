/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Static } from "typebox";
import * as Type from "typebox/type";

import { extractJsonValidator } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	stringKeyRecord,
	typeboxInterface,
	typeboxOptional,
	typeboxReadonly,
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
});
