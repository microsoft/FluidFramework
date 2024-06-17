/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import type { FlexListToUnion } from "../../feature-libraries/index.js";
import {
	type FieldSchema,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NodeFromSchema,
	TreeViewConfiguration,
	type TreeNodeFromImplicitAllowedTypes,
	type TreeView,
	SchemaFactory,
	type InternalTreeNode,
	type ApplyKind,
} from "../../simple-tree/index.js";
import type {
	ValidateRecursiveSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaFactoryRecursive.js";
import type {
	FieldSchemaUnsafe,
	InsertableTreeFieldFromImplicitFieldUnsafe,
	InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	TreeFieldFromImplicitFieldUnsafe,
	TreeNodeFromImplicitAllowedTypesUnsafe,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/typesUnsafe.js";
import { TreeFactory } from "../../treeFactory.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
	requireFalse,
} from "../../util/index.js";

import { hydrate } from "./utils.js";

// TODO:
// Ensure the following have tests:
// Recursive
// Co-Recursive
// Regular under recursive.
// Recursive under regular.
// All of the above for insertable and node APIs.
// All of the above package exported schema with API extractor.
// Ensure implicit construction and explicit construction work in all the above (or implicit fails to build in some cases (but only shallowly) and everything else works )
// Recursion through ImplicitAllowedTypes (part of co-recursion)
// Recursion through ImplicitFieldSchema (part of union and as part of co-recursion)

const sf = new SchemaFactory("recursive");

describe("SchemaFactory Recursive methods", () => {
	describe("objectRecursive", () => {
		it("End-to-end with recursive object", () => {
			const factory = new TreeFactory({});
			const schema = new SchemaFactory("com.example");

			/**
			 * Example Recursive type
			 */
			class Box extends schema.objectRecursive("Box", {
				/**
				 * Doc comment on a schema based field. Intellisense should work when referencing the field.
				 */
				text: schema.string,
				/**
				 * Example optional field.
				 * Works the same as before.
				 */
				child: schema.optionalRecursive([() => Box]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof Box>;
			}

			const config = new TreeViewConfiguration({ schema: Box });

			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);

			const view: TreeView<typeof Box> = tree.viewWith(config);
			view.initialize(new Box({ text: "hi", child: undefined }));

			assert.equal(view.root?.text, "hi");

			const stuff: undefined | Box = view.root.child;

			assert.equal(stuff, undefined);

			view.root.child = new Box({
				text: "hi2",
				child: new Box({ text: "hi3", child: new Box({ text: "hi4", child: undefined }) }),
			});

			{
				type _check1 = requireAssignableTo<undefined, typeof view.root.child.child>;
				type _check2 = requireAssignableTo<Box, typeof view.root.child.child>;
			}

			const stuff2 = view.root.child?.child?.child;

			assert.equal(stuff2?.text, "hi4");
		});

		it("object with optional recursive field", () => {
			class ObjectRecursive extends sf.objectRecursive("Object", {
				x: sf.optionalRecursive([() => ObjectRecursive]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			type XSchema = typeof ObjectRecursive.info.x;
			type Field2 = XSchema extends FieldSchema<infer Kind, infer Types>
				? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind, false>
				: "Not a FieldSchema";
			type XTypes = XSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
				? Types
				: "Not A FieldSchemaUnsafe";
			type Field3 = TreeNodeFromImplicitAllowedTypes<XTypes>;
			type Field4 = FlexListToUnion<XTypes>;
			type _check1 = requireTrue<areSafelyAssignable<Field3, ObjectRecursive>>;
			type _check2 = requireTrue<areSafelyAssignable<Field4, typeof ObjectRecursive>>;

			type Insertable = InsertableTreeNodeFromImplicitAllowedTypes<typeof ObjectRecursive>;
			type _checkInsertable = requireTrue<areSafelyAssignable<Insertable, ObjectRecursive>>;
			type Constructable = NodeFromSchema<typeof ObjectRecursive>;
			type _checkConstructable = requireTrue<
				areSafelyAssignable<Constructable, ObjectRecursive>
			>;
			type Child = ObjectRecursive["x"];
			type _checkChild = requireTrue<areSafelyAssignable<Child, ObjectRecursive | undefined>>;
			type Constructor = ConstructorParameters<typeof ObjectRecursive>;
			type _checkConstructor = requireTrue<
				areSafelyAssignable<
					Constructor,
					[
						| {
								readonly x?: ObjectRecursive;
						  }
						| InternalTreeNode,
					]
				>
			>;

			const tree = hydrate(ObjectRecursive, new ObjectRecursive({ x: undefined }));

			const data = Reflect.ownKeys(tree);
			// TODO: are empty optional fields supposed to show up as keys in simple-tree? They currently are included, but maybe thats a bug?
			// Currently optional fields must be provided explicitly when constructing nodes, but this is planned to change (with default field defaults), which will make it seem less like the should be included.
			// Additionally all the lower level abstractions omit empty fields when iterating (especially map nodes which would be infinite if they didn't): if this layer is supposed to differ it should be explicit about it.
			assert.deepEqual(data, ["x"]);

			tree.x = new ObjectRecursive({ x: undefined });

			tree.x = tree.x?.x?.x?.x ?? new ObjectRecursive({ x: undefined });

			const tree2 = hydrate(
				ObjectRecursive,
				new ObjectRecursive({ x: new ObjectRecursive({ x: undefined }) }),
			);
		});

		it("object with required recursive field", () => {
			class ObjectRecursive extends sf.objectRecursive("Object", {
				x: sf.requiredRecursive([() => ObjectRecursive, sf.number]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			type XSchema = typeof ObjectRecursive.info.x;
			type Field2 = XSchema extends FieldSchema<infer Kind, infer Types>
				? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind, false>
				: "Not a FieldSchema";
			type XTypes = XSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
				? Types
				: "Not A FieldSchemaUnsafe";
			type Field3 = TreeNodeFromImplicitAllowedTypes<XTypes>;
			type Field4 = FlexListToUnion<XTypes>;
			type _check1 = requireTrue<areSafelyAssignable<Field3, ObjectRecursive | number>>;
			type _check2 = requireTrue<
				areSafelyAssignable<Field4, typeof ObjectRecursive | typeof sf.number>
			>;

			type Insertable = InsertableTreeNodeFromImplicitAllowedTypes<typeof ObjectRecursive>;
			type _checkInsertable = requireTrue<areSafelyAssignable<Insertable, ObjectRecursive>>;
			type Constructable = NodeFromSchema<typeof ObjectRecursive>;
			type _checkConstructable = requireTrue<
				areSafelyAssignable<Constructable, ObjectRecursive>
			>;
			type Child = ObjectRecursive["x"];
			type _checkChild = requireTrue<areSafelyAssignable<Child, ObjectRecursive | number>>;
			type Constructor = ConstructorParameters<typeof ObjectRecursive>;
			type _checkConstructor = requireTrue<
				areSafelyAssignable<
					Constructor,
					[
						| {
								readonly x: ObjectRecursive | number;
						  }
						| InternalTreeNode,
					]
				>
			>;
			type _checkConstructor2 = requireFalse<
				areSafelyAssignable<
					Constructor,
					[
						| {
								readonly x?: ObjectRecursive | number;
						  }
						| InternalTreeNode,
					]
				>
			>;

			const tree = hydrate(
				ObjectRecursive,
				new ObjectRecursive({ x: new ObjectRecursive({ x: 42 }) }),
			);
		});

		it("other under recursive object", () => {
			class Other extends sf.object("Other", {
				y: sf.number,
			}) {}
			class ObjectRecursive extends sf.objectRecursive("Object", {
				x: sf.optionalRecursive([() => ObjectRecursive]),
				a: Other,
				b: [Other],
				c: [() => Other],
				d: sf.optional(Other),
				e: sf.optional([() => Other]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			const tree2 = hydrate(
				ObjectRecursive,
				new ObjectRecursive({
					x: undefined,
					a: new Other({ y: 5 }),
					b: new Other({ y: 5 }),
					c: new Other({ y: 5 }),
					d: new Other({ y: 5 }),
					e: new Other({ y: 5 }),
				}),
			);
		});

		it("object nested construction", () => {
			class ObjectRecursive extends sf.objectRecursive("Object", {
				x: sf.optionalRecursive([() => ObjectRecursive]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			{
				const field = ObjectRecursive.info.x;
				type Field = typeof field;
				type IC = (typeof ObjectRecursive)["implicitlyConstructable"];
				type Xa = TreeFieldFromImplicitFieldUnsafe<Field>;
				type Xb = InsertableTreeFieldFromImplicitFieldUnsafe<Field>;

				type AllowedTypes = Field["allowedTypes"];
				type X2a = TreeNodeFromImplicitAllowedTypesUnsafe<AllowedTypes>;
				type X2b = InsertableTreeNodeFromImplicitAllowedTypesUnsafe<AllowedTypes>;
			}

			const tree = hydrate(ObjectRecursive, new ObjectRecursive({ x: undefined }));

			tree.x = new ObjectRecursive({ x: undefined });
			// tree.x = new ObjectRecursive({ x: { x: undefined } });
			// tree.x = new ObjectRecursive({ x: { x: { x: { x: { x: undefined } } } } });

			tree.x = new ObjectRecursive({ x: undefined });
			tree.x = new ObjectRecursive({ x: new ObjectRecursive({ x: undefined }) });
			tree.x = new ObjectRecursive({
				x: new ObjectRecursive({ x: new ObjectRecursive({ x: undefined }) }),
			});

			tree.x = tree.x?.x?.x?.x ?? new ObjectRecursive({ x: undefined });
		});

		it("co-recursive objects with implicit field", () => {
			class A extends sf.objectRecursive("A", {
				a: sf.optionalRecursive([() => B]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}

			class B extends sf.object("B", {
				// Implicit required field
				b: A,
			}) {}

			{
				const tree = hydrate(B, { b: new A({ a: undefined }) });
				assert.equal(tree.b.a, undefined);
			}

			{
				const tree = hydrate(B, new B({ b: new A({ a: undefined }) }));
				assert.equal(tree.b.a, undefined);
			}

			{
				const tree = hydrate(A, new A({ a: undefined }));
				assert.equal(tree.a, undefined);
			}

			{
				const tree = hydrate(A, new A({ a: new B({ b: new A({ a: undefined }) }) }));
				assert.equal(tree.a!.b.a, undefined);
			}

			{
				const tree = hydrate(A, new A({ a: { b: new A({ a: undefined }) } }));
				assert.equal(tree.a!.b.a, undefined);
			}
		});

		it("co-recursive objects with explicit non-recursive field", () => {
			class A extends sf.objectRecursive("A", {
				a: sf.optionalRecursive([() => B]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}

			class B extends sf.object("B", {
				b: sf.optional(A),
			}) {}

			{
				const tree = hydrate(B, { b: new A({ a: undefined }) });
				assert.equal(tree.b!.a, undefined);
			}

			{
				const tree = hydrate(B, new B({ b: new A({ a: undefined }) }));
				assert.equal(tree.b!.a, undefined);
			}

			{
				const tree = hydrate(A, new A({ a: undefined }));
				assert.equal(tree.a, undefined);
			}

			{
				const tree = hydrate(A, new A({ a: new B({ b: new A({ a: undefined }) }) }));
				assert.equal(tree.a!.b!.a, undefined);
			}

			{
				const tree = hydrate(A, new A({ a: { b: new A({ a: undefined }) } }));
				assert.equal(tree.a!.b!.a, undefined);
			}
		});

		it("recursive object with implicit recursive field", () => {
			class A extends sf.objectRecursive("A", {
				a: [() => B, sf.number],
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}

			class B extends sf.object("B", {
				b: sf.optional(A),
			}) {}

			{
				const tree = hydrate(B, { b: new A({ a: 5 }) });
				assert.equal(tree.b!.a, 5);
			}

			{
				const tree = hydrate(A, new A({ a: 5 }));
				assert.equal(tree.a, 5);
			}

			{
				const tree = hydrate(A, new A({ a: new B({ b: new A({ a: 6 }) }) }));
				assert.equal((tree.a as B).b!.a, 6);
			}
		});
	});
	describe("ValidateRecursiveSchema", () => {
		it("Valid cases", () => {
			{
				class Test extends sf.arrayRecursive("Test", [() => Test]) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends sf.objectRecursive("Test", {
					x: sf.optionalRecursive([() => Test]),
				}) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends sf.mapRecursive("Test", [() => Test]) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}
		});

		it("Invalid cases", () => {
			{
				class Test extends sf.arrayRecursive("Test", () => Test) {}
				// @ts-expect-error Missing [] around allowed types.
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends sf.objectRecursive("Test", sf.optionalRecursive([() => Test])) {}
				// @ts-expect-error Objects take a record type with fields, not a field directly.
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class MapRecursive extends sf.mapRecursive(
					"Test",
					sf.optionalRecursive([() => MapRecursive]),
				) {}
				// @ts-expect-error Maps accept allowed types, not field schema.
				type _check = ValidateRecursiveSchema<typeof MapRecursive>;
			}
		});
	});

	describe("arrayRecursive", () => {
		it("simple", () => {
			class ArrayRecursive extends sf.arrayRecursive("List", [() => ArrayRecursive]) {}
			{
				type _check = ValidateRecursiveSchema<typeof ArrayRecursive>;
			}
			// Explicit constructor call
			{
				const data: ArrayRecursive = hydrate(ArrayRecursive, new ArrayRecursive([]));
				assert.deepEqual([...data], []);
			}
			// Nested
			{
				const data: ArrayRecursive = hydrate(
					ArrayRecursive,
					new ArrayRecursive([new ArrayRecursive([])]),
				);
				assert.equal(data.length, 1);
				assert.deepEqual([...data[0]], []);

				type T = InsertableTreeNodeFromImplicitAllowedTypes<typeof ArrayRecursive>;
				// @ts-expect-error ListRecursive should not be implicitly constructable (for now).
				const _check: T = [];
				// Only explicitly constructed recursive lists are currently allowed:
				type _check = requireTrue<areSafelyAssignable<T, ArrayRecursive>>;

				data.insertAtEnd(new ArrayRecursive([]));

				data[0].insertAtEnd(new ArrayRecursive([]));
			}
		});
	});

	describe("mapRecursive", () => {
		it("simple", () => {
			class MapRecursive extends sf.mapRecursive("Map", [() => MapRecursive]) {}
			{
				type _check = ValidateRecursiveSchema<typeof MapRecursive>;
			}
			const node = hydrate(MapRecursive, new MapRecursive([]));
			const data = [...node];
			assert.deepEqual(data, []);

			// Nested
			{
				type T = InsertableTreeNodeFromImplicitAllowedTypes<typeof MapRecursive>;
				const _check: T = new MapRecursive([]);
				// Only explicitly constructed recursive maps are currently allowed:
				type _check = requireTrue<areSafelyAssignable<T, MapRecursive>>;
			}

			node.set("x", new MapRecursive([]));

			node.get("x")?.set("x", new MapRecursive(new Map()));
		});
	});

	it("recursive under non-recursive", () => {
		class ArrayRecursive extends sf.arrayRecursive("List", [() => ArrayRecursive]) {}
		{
			type _check = ValidateRecursiveSchema<typeof ArrayRecursive>;
		}
		class Root extends sf.object("Root", {
			r: ArrayRecursive,
		}) {}

		const r = hydrate(Root, { r: new ArrayRecursive([]) });
		assert.deepEqual([...r.r], []);
	});
});
