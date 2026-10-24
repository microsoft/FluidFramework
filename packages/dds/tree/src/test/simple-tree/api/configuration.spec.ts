/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createIdCompressor,
	SerializationVersion,
} from "@fluidframework/id-compressor/internal";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { createIndependentTreeViewAlpha } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Inspect analysis reuse without adding public APIs.
import { getTreeNodeSchemaPrivateData } from "../../../simple-tree/core/index.js";
import {
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	checkUnion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/configuration.js";
import {
	type TreeNodeSchema,
	SchemaFactory,
	SchemaFactoryAlpha,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getSchemaDerivedData } from "../../../simple-tree/treeSchema.js";

const schema = new SchemaFactory("com.example");

describe("simple-tree configuration", () => {
	it("reuses completed analysis while revalidating each configuration", () => {
		const sf = new SchemaFactoryAlpha("singleWalk");
		class Leaf extends sf.object("Leaf", { value: sf.number }) {}
		class A extends sf.objectRecursive("A", {
			child: sf.optionalRecursive([() => B]),
			leaf: Leaf,
		}) {}
		class B extends sf.objectRecursive("B", {
			child: sf.optionalRecursive([() => A]),
		}) {}
		const reads = new Map<TreeNodeSchema, number>();
		for (const node of [A, B, Leaf]) {
			const data = getTreeNodeSchemaPrivateData(node);
			const types = data.childAllowedTypes;
			Object.defineProperty(data, "childAllowedTypes", {
				get() {
					reads.set(node, (reads.get(node) ?? 0) + 1);
					return types;
				},
			});
		}
		const config = new TreeViewConfigurationAlpha({ schema: A });
		// View discovery, view-component finalization, and stored-component discovery each read the fields.
		assert.deepEqual([...reads.values()], [3, 3, 3]);
		const component = getTreeNodeSchemaPrivateData(A).component;
		const strict = new TreeViewConfigurationAlpha({ schema: A, preventAmbiguity: true });
		assert.deepEqual([...reads.values()], [4, 4, 4]);
		assert.strictEqual(config.definitions, strict.definitions);
		assert.strictEqual(component, getTreeNodeSchemaPrivateData(A).component);
		assert.equal(getTreeNodeSchemaPrivateData(Leaf).component?.definitions, undefined);
		assert.equal(getSchemaDerivedData(A).unhydratedContext, undefined);
	});

	it("reports duplicate allowed types before evaluating later fields", () => {
		const sf = new SchemaFactoryAlpha("validationOrder");
		let laterEvaluations = 0;
		class Root extends sf.objectRecursive("Root", {
			duplicate: sf.optional([sf.number, sf.number]),
			later: sf.optionalRecursive([
				() => {
					laterEvaluations++;
					throw new Error("later evaluation");
				},
			]),
		}) {}
		for (let i = 0; i < 2; i++) {
			assert.throws(
				() => new TreeViewConfigurationAlpha({ schema: Root }),
				validateUsageError(/Duplicate schema in allowed types/),
			);
			assert.equal(laterEvaluations, 0);
			assert.equal(getTreeNodeSchemaPrivateData(Root).component, undefined);
		}
	});

	for (const strictFirst of [false, true]) {
		it(`preserves ambiguity-before-identifier validation phases (${strictFirst} first)`, () => {
			const sf = new SchemaFactoryAlpha("validationPhases");
			class A extends sf.array("Duplicate", sf.number) {}
			class B extends sf.array("Duplicate", sf.number) {}
			for (const preventAmbiguity of [strictFirst, !strictFirst]) {
				assert.throws(
					() => new TreeViewConfigurationAlpha({ schema: [A, B], preventAmbiguity }),
					validateUsageError(
						preventAmbiguity ? /Ambiguous schema/ : /Multiple schema encountered/,
					),
				);
			}
		});
	}

	for (const strictFirst of [false, true]) {
		it(`validates cached unions with preventAmbiguity=${strictFirst} first`, () => {
			const sf = new SchemaFactoryAlpha("cachedValidation");
			class A extends sf.array("A", sf.number) {}
			class B extends sf.array("B", sf.number) {}
			const root = [A, B] as const;
			getSchemaDerivedData(root);
			for (const preventAmbiguity of [strictFirst, !strictFirst]) {
				const create = () => new TreeViewConfiguration({ schema: root, preventAmbiguity });
				if (preventAmbiguity) {
					assert.throws(create, validateUsageError(/Ambiguous schema/));
				} else {
					create();
				}
			}
			const duplicate = [A, A] as const;
			getSchemaDerivedData(duplicate);
			assert.throws(
				() => new TreeViewConfiguration({ schema: duplicate }),
				validateUsageError(/Duplicate schema in allowed types/),
			);
			class Parent extends sf.object("Parent", {
				ambiguous: root,
				invalid: duplicate,
			}) {}
			getSchemaDerivedData(Parent);
			assert.throws(
				() => new TreeViewConfiguration({ schema: Parent, preventAmbiguity: true }),
				validateUsageError(/Duplicate schema in allowed types/),
			);
		});
	}

	it("supports construction before configurations and shares only reachable definitions", () => {
		const sf = new SchemaFactoryAlpha("beforeConfiguration");
		class Child extends sf.object("Child", {}) {}
		const child = new Child({});
		class A extends sf.object("A", { child: Child }) {}
		class B extends sf.object("B", { child: Child }) {}
		for (const root of [A, B]) {
			const config = new TreeViewConfigurationAlpha({ schema: root });
			assert.strictEqual(
				config.definitions,
				getSchemaDerivedData(root).treeSchema.definitions,
			);
			new root({ child: root === A ? child : new Child({}) });
		}
		assert.equal(getSchemaDerivedData(Child).treeSchema.definitions.size, 1);
	});

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
			// This combination of schemas can lead to ambiguous cases, and would error if preventAmbiguity is true.
			schema: [Feet, Meters],
			preventAmbiguity: false,
		});
		const view = createIndependentTreeViewAlpha(config, {
			idCompressor: createIdCompressor(SerializationVersion.V3),
		});
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
			// This combination of schemas is not ambiguous because `Feet` and `Meters` have different required keys.
			schema: [Feet, Meters],
			preventAmbiguity: true,
		});
		const view = createIndependentTreeViewAlpha(config, {
			idCompressor: createIdCompressor(SerializationVersion.V3),
		});
		// This now works, since the field is sufficient to determine this is a `Meters` node.
		view.initialize({ meters: 5 });
	});

	it("detects duplicate schema identifiers", () => {
		const schemaFactory = new SchemaFactory("test");
		assert.throws(
			() =>
				new TreeViewConfiguration({
					schema: [schemaFactory.map("x", []), schemaFactory.array("x", [])],
				}),
			validateUsageError(/Multiple schema/),
		);
	});

	describe("checkUnion", () => {
		const schemaFactory = new SchemaFactoryAlpha("test");

		function getErrors(schemaToCheck: Iterable<TreeNodeSchema>): string[] {
			const errors: string[] = [];
			checkUnion(schemaToCheck, true, errors);
			return errors;
		}

		it("duplicates", () => {
			checkUnion([schemaFactory.string], true, []);
			assert.throws(
				() => checkUnion([schemaFactory.string, schemaFactory.string], true, []),
				validateUsageError(/Duplicate schema/),
			);
			assert.throws(
				() => checkUnion([schemaFactory.string, schemaFactory.string], false, []),
				validateUsageError(/Duplicate schema/),
			);
		});

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
		it("records", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.record("A", schemaFactory.string),
					schemaFactory.record("B", schemaFactory.number),
				]),
				[
					`More than one kind of record allowed within union (["test.A", "test.B"]). This would require type disambiguation which is not supported by records during import or export.`,
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
					`A combination of objects and maps is allowed within union (["test.B", "test.A"]). These can be constructed from objects and can be ambiguous.`,
				],
			);
		});
		it("object and record", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.object("A", { a: schemaFactory.string }),
					schemaFactory.record("B", schemaFactory.string),
				]),
				[
					`A combination of objects and records is allowed within union (["test.A", "test.B"]). These can be constructed from objects and can be ambiguous.`,
				],
			);
		});
		it("array and record", () => {
			// No potential ambiguity, so this should pass.
			assert.deepEqual(
				getErrors([
					schemaFactory.array("A", schemaFactory.string),
					schemaFactory.record("B", schemaFactory.string),
				]),
				[],
			);
		});
		it("map and record", () => {
			assert.deepEqual(
				getErrors([
					schemaFactory.map("A", schemaFactory.string),
					schemaFactory.record("B", schemaFactory.string),
				]),
				[
					`A combination of maps and records is allowed within union (["test.A", "test.B"]). These can be constructed from objects and can be ambiguous.`,
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

	it("creates TreeViewConfigurationAlpha", () => {
		const config = new TreeViewConfiguration({ schema: [] });
		assert(config instanceof TreeViewConfigurationAlpha);
	});
});
