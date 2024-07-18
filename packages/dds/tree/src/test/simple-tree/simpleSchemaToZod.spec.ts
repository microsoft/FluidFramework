/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
	toZodSchema,
	type SimpleNodeSchema,
	type SimpleTreeSchema,
} from "../../simple-tree/index.js";
import type { ZodType } from "zod";

// TODOs:
// - Identifier fields
// - Ambiguous polymorphism cases

function validate(schema: ZodType, data: unknown, expectValid: boolean): void {
	try {
		schema.parse(data);
		assert(expectValid, "Expected data to be schema compatible, but it was rejected.");
	} catch {
		assert(!expectValid, "Expected data to be schema incompatible, but it was allowed.");
	}
}

describe.only("simpleSchemaToZod", () => {
	it("Leaf schema", async () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				["test.string", { type: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.string"]),
		};

		const schema = toZodSchema(input);

		// Verify expected data validation behavior.
		validate(schema, "Hello world", true);
		validate(schema, {}, false);
		validate(schema, [], false);
	});

	it("Array schema", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				["test.array", { kind: "array", allowedTypes: new Set<string>(["test.string"]) }],
				["test.string", { type: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.array"]),
		};

		const schema = toZodSchema(input);

		// Verify expected data validation behavior.
		validate(schema, "Hello world", false);
		validate(schema, {}, false);
		validate(schema, [], true);
		validate(schema, [42], false);
		validate(schema, ["Hello", "world"], true);
		validate(schema, ["Hello", 42, "world"], false);
	});

	it.skip("Map schema", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				["test.map", { kind: "map", allowedTypes: new Set<string>(["test.string"]) }],
				["test.string", { type: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.map"]),
		};

		const schema = toZodSchema(input);

		// Verify expected data validation behavior.
		validate(schema, "Hello world", false);
		validate(schema, [], false);
		validate(schema, {}, true);
		validate(
			schema,
			{
				foo: "Hello",
				bar: "World",
			},
			true,
		);
		validate(
			schema,
			{
				foo: "Hello",
				bar: "World",
				baz: 42,
			},
			false,
		);
	});

	it("Object schema", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: "object",
						fields: {
							"foo": { kind: "optional", allowedTypes: new Set<string>(["test.number"]) },
							"bar": { kind: "required", allowedTypes: new Set<string>(["test.string"]) },
						},
					},
				],
				["test.string", { type: "string", kind: "leaf" }],
				["test.number", { type: "number", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.object"]),
		};

		const schema = toZodSchema(input);

		// Verify expected data validation behavior.
		validate(schema, "Hello world", false);
		validate(schema, [], false);
		validate(schema, {}, false);
		validate(
			schema,
			{
				foo: 42,
			},
			false,
		);
		validate(
			schema,
			{
				bar: "Hello World",
			},
			true,
		);
		validate(
			schema,
			{
				foo: 42,
				bar: "Hello World",
			},
			true,
		);
		validate(
			schema,
			{
				foo: 42,
				bar: "Hello World",
				baz: true,
			},
			false,
		);
	});

	it("Recursive object schema", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.recursive-object",
					{
						kind: "object",
						fields: {
							"foo": {
								kind: "optional",
								allowedTypes: new Set<string>(["test.string", "test.recursive-object"]),
							},
						},
					},
				],
				["test.string", { type: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.recursive-object"]),
		};
		const schema = toZodSchema(input);

		// Verify expected data validation behavior.
		validate(schema, {}, true);
		validate(schema, { foo: {} }, true);
		validate(schema, { foo: "Hello world" }, true);
		validate(schema, { foo: { foo: "Hello world" } }, true);

		validate(schema, "Hello world", false);
		validate(schema, [], false);
		validate(schema, { foo: 42 }, false);
		validate(schema, { foo: { foo: 42 } }, false);
		validate(schema, { bar: "Hello world" }, false);
		validate(schema, { foo: { bar: "Hello world" } }, false);
	});
});
