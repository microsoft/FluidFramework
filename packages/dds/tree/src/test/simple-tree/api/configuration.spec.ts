/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import { type TreeNodeSchema, SchemaFactory } from "../../../simple-tree/index.js";
import { validateUsageError } from "../../utils.js";
import { independentView } from "../../../shared-tree/index.js";

import {
	TreeViewConfiguration,
	checkUnion,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/configuration.js";

const schema = new SchemaFactory("com.example");

describe("simple-tree configuration", () => {
	it("preventAmbiguity", () => {
		const config = new TreeViewConfiguration({
			schema: [schema.array(schema.string), schema.array(schema.number)],
			preventAmbiguity: false,
		});
		assert.throws(
			() =>
				new TreeViewConfiguration({
					schema: [schema.array(schema.string), schema.array(schema.number)],
					preventAmbiguity: true,
				}),
			validateUsageError(/More than one kind of array/),
		);
		const config2 = new TreeViewConfiguration({
			schema: [schema.object("foo", {}), schema.array(schema.number)],
			preventAmbiguity: true,
		});
		assert.throws(
			() =>
				new TreeViewConfiguration({
					schema: schema.array([schema.array(schema.string), schema.array(schema.number)]),
					preventAmbiguity: true,
				}),
			validateUsageError(/More than one kind of array/),
		);
	});

	it("preventAmbiguity - example ambiguous", () => {
		const schemaFactory = new SchemaFactory("com.example");
		class Feet extends schemaFactory.object("Feet", { length: schemaFactory.number }) {}
		class Meters extends schemaFactory.object("Meters", { length: schemaFactory.number }) {}
		const config = new TreeViewConfiguration({
			// This combination of schema is can lead to ambiguous cases, and would error if preventAmbiguity is true.
			schema: [Feet, Meters],
			preventAmbiguity: false,
		});
		const view = independentView(config, { idCompressor: createIdCompressor() });
		// This is invalid since it is ambiguous which type of node is being constructed:
		// view.initialize({ length: 5 });
		// To work, an explicit type can be provided by using an {@link Unhydrated} Node:
		view.initialize(new Meters({ length: 5 }));
	});

	it("preventAmbiguity - example unambiguous", () => {
		const schemaFactory = new SchemaFactory("com.example");
		class Feet extends schemaFactory.object("Feet", { length: schemaFactory.number }) {}
		class Meters extends schemaFactory.object("Meters", {
			// To avoid ambiguity when parsing unions of Feet and Meters, this renames the length field to "meters".
			// To preserve compatibility with existing data from the ambiguous case,
			// `{ key: "length" }` is set, so when persisted in the tree "length" is used as the field name.
			meters: schemaFactory.required(schemaFactory.number, { key: "length" }),
		}) {}
		const config = new TreeViewConfiguration({
			// This combination of schema is not ambiguous because `Feet` and `Meters` have different required keys.
			schema: [Feet, Meters],
			preventAmbiguity: true,
		});
		const view = independentView(config, { idCompressor: createIdCompressor() });
		// This now works, since the field is sufficient to determine this is a `Meters` node.
		view.initialize({ meters: 5 });
	});

	describe("checkUnion", () => {
		const schemaFactory = new SchemaFactory("test");

		function getErrors(schemaToCheck: Iterable<TreeNodeSchema>): string[] {
			const errors: string[] = [];
			checkUnion(schemaToCheck, errors);
			return errors;
		}

		it("arrays", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.array("A", schemaFactory.string),
					schemaFactory.array("B", schemaFactory.number),
				]),
				[
					`More than one kind of array allowed within union (["test.A", "test.B"]). This would require type disambiguation which is not supported by arrays during import or export.`,
				],
			);
		});
		it("maps", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.map("A", schemaFactory.string),
					schemaFactory.map("B", schemaFactory.number),
				]),
				[
					`More than one kind of map allowed within union (["test.A", "test.B"]). This would require type disambiguation which is not supported by maps during import or export.`,
				],
			);
		});
		it("array and map", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.array("A", schemaFactory.string),
					schemaFactory.map("B", schemaFactory.number),
				]),
				[
					`Both a map and an array allowed within union (["test.A", "test.B"]). Both can be implicitly constructed from iterables like arrays, which are ambiguous when the array is empty.`,
				],
			);
		});
		it("map and object", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.map("A", schemaFactory.string),
					schemaFactory.object("B", {}),
				]),
				[
					`Both a object and a map allowed within union (["test.B", "test.A"]). Both can be constructed from objects and can be ambiguous.`,
				],
			);
		});
		it("compatible", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.string,
					schemaFactory.number,
					schemaFactory.boolean,
					schemaFactory.null,
					schemaFactory.handle,
					schemaFactory.array("A", schemaFactory.string),
					schemaFactory.object("B", {}),
				]),
				[],
			);
		});

		it("compatible objects", () => {
			// Disjoint field sets
			assert.deepEqual(
				getErrors([
					schemaFactory.object("A", { a: schemaFactory.null }),
					schemaFactory.object("B", { b: schemaFactory.null }),
				]),
				[],
			);
			// overlapping fields sets
			assert.deepEqual(
				getErrors([
					schemaFactory.object("A", { a: schemaFactory.null, b: schemaFactory.null }),
					schemaFactory.object("B", { b: schemaFactory.null, c: schemaFactory.null }),
					schemaFactory.object("C", { c: schemaFactory.null, a: schemaFactory.null }),
				]),
				[],
			);
			// empty case
			assert.deepEqual(getErrors([schemaFactory.object("A", {})]), []);
		});

		it("incompatible objects", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.object("A", { a: schemaFactory.null }),
					schemaFactory.object("B", {
						b: schemaFactory.null,
						a: schemaFactory.optional(schemaFactory.null),
					}),
				]),
				[
					'The required fields of "test.A" are insufficient to differentiate it from the following types: ["test.B"]. For objects to be considered unambiguous, each must have required fields that do not all occur on any other object in the union.',
				],
			);
		});
	});
});
