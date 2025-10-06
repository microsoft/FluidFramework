/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	type FieldSchema,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NodeFromSchema,
	TreeViewConfiguration,
	type TreeNodeFromImplicitAllowedTypes,
	type TreeView,
	SchemaFactory,
	type InternalTreeNode,
	type FlexListToUnion,
	type ApplyKindInput,
	type NodeBuilderData,
	SchemaFactoryAlpha,
} from "../../../simple-tree/index.js";
import {
	allowUnused,
	type ValidateRecursiveSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/schemaFactoryRecursive.js";
import type {
	System_Unsafe,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/typesUnsafe.js";
import { SharedTree } from "../../../treeFactory.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
	requireFalse,
} from "../../../util/index.js";

import { hydrate } from "../utils.js";
import { validateTypeError } from "../../utils.js";

// Tests for SchemaFactoryRecursive.ts and the recursive API subset of SchemaFactory and SchemaFactoryAlpha.
// It is a bit odd/non-conventional to put the tests for the recursive methods of SchemaFactory here:
// while they could be combined, keeping them separated like this is somewhat nice due to the size of these test suites,
// and how annoying the recursive ones are with intelliSense errors.

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

const schemaFactory = new SchemaFactory("recursive");

describe("SchemaFactory Recursive methods", () => {
	describe("objectRecursive", () => {
		it("End-to-end with recursive object", () => {
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

			const tree = SharedTree.create(
				new MockFluidDataStoreRuntime({
					idCompressor: createIdCompressor(),
					registry: [SharedTree.getFactory()],
				}),
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
			class ObjectRecursive extends schemaFactory.objectRecursive("Object", {
				x: SchemaFactory.optionalRecursive([() => ObjectRecursive]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			type XSchema = typeof ObjectRecursive.info.x;
			type Field2 = XSchema extends FieldSchema<infer Kind, infer Types>
				? ApplyKindInput<TreeNodeFromImplicitAllowedTypes<Types>, Kind, false>
				: "Not a FieldSchema";
			type XTypes = XSchema extends System_Unsafe.FieldSchemaUnsafe<infer Kind, infer Types>
				? Types
				: "Not A System_Unsafe.FieldSchemaUnsafe";
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
			class ObjectRecursive extends schemaFactory.objectRecursive("Object", {
				x: SchemaFactory.requiredRecursive([() => ObjectRecursive, SchemaFactory.number]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			type XSchema = typeof ObjectRecursive.info.x;
			type Field2 = XSchema extends FieldSchema<infer Kind, infer Types>
				? ApplyKindInput<TreeNodeFromImplicitAllowedTypes<Types>, Kind, false>
				: "Not a FieldSchema";
			type XTypes = XSchema extends System_Unsafe.FieldSchemaUnsafe<infer Kind, infer Types>
				? Types
				: "Not A System_Unsafe.FieldSchemaUnsafe";
			type Field3 = TreeNodeFromImplicitAllowedTypes<XTypes>;
			type Field4 = FlexListToUnion<XTypes>;
			type _check1 = requireTrue<areSafelyAssignable<Field3, ObjectRecursive | number>>;
			type _check2 = requireTrue<
				areSafelyAssignable<Field4, typeof ObjectRecursive | typeof SchemaFactory.number>
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
			class Other extends schemaFactory.object("Other", {
				y: schemaFactory.number,
			}) {}
			class ObjectRecursive extends schemaFactory.objectRecursive("Object", {
				x: schemaFactory.optionalRecursive([() => ObjectRecursive]),
				a: Other,
				b: [Other],
				c: [() => Other],
				d: schemaFactory.optional(Other),
				e: schemaFactory.optional([() => Other]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			// Explicit construction under recursive type
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

			// implicit construction under recursive type
			const tree3 = hydrate(
				ObjectRecursive,
				new ObjectRecursive({
					x: undefined,
					a: { y: 5 },
					b: { y: 5 },
					c: { y: 5 },
					d: { y: 5 },
					e: { y: 5 },
				}),
			);
		});

		it("array under recursive object", () => {
			class Other extends schemaFactory.array("Other", schemaFactory.number) {}
			class ObjectRecursive extends schemaFactory.objectRecursive("Object", {
				x: schemaFactory.optionalRecursive([() => ObjectRecursive]),
				a: Other,
				b: [Other],
				c: [() => Other],
				d: schemaFactory.optional(Other),
				e: schemaFactory.optional([() => Other]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			// Explicit construction under recursive type
			const tree2 = hydrate(
				ObjectRecursive,
				new ObjectRecursive({
					x: undefined,
					a: new Other([5]),
					b: new Other([5]),
					c: new Other([5]),
					d: new Other([5]),
					e: new Other([5]),
				}),
			);

			// implicit construction under recursive type
			const tree3 = hydrate(
				ObjectRecursive,
				new ObjectRecursive({
					x: undefined,
					a: [5],
					b: [5],
					c: [5],
					d: [5],
					e: [5],
				}),
			);
		});

		it("object nested construction", () => {
			class ObjectRecursive extends schemaFactory.objectRecursive("Object", {
				x: schemaFactory.optionalRecursive([() => ObjectRecursive]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof ObjectRecursive>;
			}

			{
				const field = ObjectRecursive.info.x;
				type Field = typeof field;
				type IC = (typeof ObjectRecursive)["implicitlyConstructable"];
				type Xa = System_Unsafe.TreeFieldFromImplicitFieldUnsafe<Field>;
				type Xb = System_Unsafe.InsertableTreeFieldFromImplicitFieldUnsafe<Field>;

				type AllowedTypes = Field["allowedTypes"];
				type X2a = System_Unsafe.TreeNodeFromImplicitAllowedTypesUnsafe<AllowedTypes>;
				type X2b =
					System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<AllowedTypes>;
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
			class A extends schemaFactory.objectRecursive("A", {
				a: schemaFactory.optionalRecursive([() => B]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}

			class B extends schemaFactory.object("B", {
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
			class A extends schemaFactory.objectRecursive("A", {
				a: schemaFactory.optionalRecursive([() => B]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}

			class B extends schemaFactory.object("B", {
				b: schemaFactory.optional(A),
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
			class A extends schemaFactory.objectRecursive("A", {
				a: [() => B, schemaFactory.number],
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}

			class B extends schemaFactory.object("B", {
				b: schemaFactory.optional(A),
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

		it("Node schema metadata", () => {
			const factory = new SchemaFactoryAlpha("");
			class Foo extends factory.objectRecursive(
				"Foo",
				{ bar: [() => Foo] },
				{
					metadata: {
						description: "A recursive object called Foo",
						custom: { baz: true },
					},
				},
			) {}

			assert.deepEqual(Foo.metadata, {
				description: "A recursive object called Foo",
				custom: { baz: true },
			});

			// Ensure `Foo.metadata` is typed as we expect, and we can access its fields without casting.
			const baz = Foo.metadata.custom.baz;
			type _check1 = requireTrue<areSafelyAssignable<typeof baz, true>>;
		});
	});
	describe("ValidateRecursiveSchema", () => {
		it("Valid cases", () => {
			{
				class Test extends schemaFactory.arrayRecursive("Test", [() => Test]) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends schemaFactory.objectRecursive("Test", {
					x: schemaFactory.optionalRecursive([() => Test]),
				}) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends schemaFactory.mapRecursive("Test", [() => Test]) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}
		});

		it("Valid cases: SchemaFactoryAlpha", () => {
			const factoryAlpha = new SchemaFactoryAlpha("");

			{
				class Test extends factoryAlpha.arrayRecursive("Test", [() => Test]) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends factoryAlpha.objectRecursive("Test", {
					x: factoryAlpha.optionalRecursive([() => Test]),
				}) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends factoryAlpha.mapRecursive("Test", [() => Test]) {}
				type _check = ValidateRecursiveSchema<typeof Test>;
			}
		});

		// TODO:AB#45711: Support annotated allowed types in recursive APIs.
		it("Valid cases: annotated", () => {
			const factory = new SchemaFactoryAlpha("");
			{
				class Test extends factory.arrayRecursive("Test", [
					{ type: () => Test, metadata: {} },
				]) {}
				// @ts-expect-error Does not support annotations yet
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends factory.objectRecursive("Test", {
					x: factory.optionalRecursive([{ type: () => Test, metadata: {} }]),
				}) {}
				// @ts-expect-error Does not support annotations yet
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends factory.mapRecursive("Test", [
					{ type: () => Test, metadata: {} },
				]) {}
				// @ts-expect-error Does not support annotations yet
				type _check = ValidateRecursiveSchema<typeof Test>;
			}
		});

		// TODO:AB#45711: Support annotated allowed types in recursive APIs.
		it("Valid cases: annotated non-recursive child", () => {
			// While ValidateRecursiveSchema is intended only for recursive schema,
			// it needs to be able to handle non-recursive children under a recursive schema.
			// To simplify testing that, this test just checks some non-recursive cases.

			const factory = new SchemaFactoryAlpha("");
			{
				class Test extends factory.arrayAlpha("Test", [
					{ type: () => factory.null, metadata: {} },
				]) {}
				// @ts-expect-error Does not support annotations
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends factory.objectAlpha("Test", {
					x: factory.optional([{ type: () => factory.null, metadata: {} }]),
				}) {}
				// @ts-expect-error Does not support annotations
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends factory.mapAlpha("Test", [
					{ type: () => factory.null, metadata: {} },
				]) {}
				// @ts-expect-error Does not support annotations
				type _check = ValidateRecursiveSchema<typeof Test>;
			}
		});

		it("Invalid cases", () => {
			// These are type tests and expected to fail during compilation
			// eslint-disable-next-line no-constant-condition
			if (false) {
				{
					// @ts-expect-error Missing [] around allowed types.
					class Test extends schemaFactory.arrayRecursive("Test", () => Test) {}
					// @ts-expect-error Missing [] around allowed types.
					type _check = ValidateRecursiveSchema<typeof Test>;
				}

				{
					// @ts-expect-error Objects take a record type with fields, not a field directly.
					class Test extends schemaFactory.objectRecursive(
						"Test",
						// @ts-expect-error Objects take a record type with fields, not a field directly.
						schemaFactory.optionalRecursive([() => Test]),
					) {}
					// @ts-expect-error Objects take a record type with fields, not a field directly.
					type _check = ValidateRecursiveSchema<typeof Test>;
				}

				{
					// @ts-expect-error 'MapRecursive' is referenced directly or indirectly in its own base expression.
					class MapRecursive extends schemaFactory.mapRecursive(
						"Test",
						// @ts-expect-error Maps accept allowed types, not field schema.
						schemaFactory.optionalRecursive([() => MapRecursive]),
					) {}
					// @ts-expect-error Maps accept allowed types, not field schema.
					type _check = ValidateRecursiveSchema<typeof MapRecursive>;
				}

				const factoryAlpha = new SchemaFactoryAlpha("");
				{
					class Test extends factoryAlpha.arrayRecursive("Test", [
						{ wrong: () => Test, metadata: {} },
					]) {}
					// @ts-expect-error This is malformed, and should fail
					type _check = ValidateRecursiveSchema<typeof Test>;
				}
			}

			{
				class Test extends schemaFactory.arrayRecursive("Test", [() => {}]) {}
				// @ts-expect-error referenced type not a schema.
				type _check = ValidateRecursiveSchema<typeof Test>;
			}

			{
				class Test extends schemaFactory.arrayRecursive("Test", [() => ({ Test })]) {}
				// @ts-expect-error referenced type not a schema.
				type _check = ValidateRecursiveSchema<typeof Test>;
			}
		});

		it("AllowUnused", () => {
			{
				class Test extends schemaFactory.arrayRecursive("Test", [() => Test]) {}
				allowUnused<ValidateRecursiveSchema<typeof Test>>();
			}

			{
				class Test extends schemaFactory.arrayRecursive("Test", [() => {}]) {}
				// @ts-expect-error referenced type not a schema.
				allowUnused<ValidateRecursiveSchema<typeof Test>>();
			}

			{
				class Test extends schemaFactory.arrayRecursive("Test", [() => ({ Test })]) {}
				// @ts-expect-error referenced type not a schema.
				type _check = ValidateRecursiveSchema<typeof Test>;
			}
		});

		it("Invalid undetected case ", () => {
			// Any should be rejected to help ensure builds which allow implicit any allowed error on schema which implicitly produce `any`.
			{
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				type _check = ValidateRecursiveSchema<any>;
			}
		});
	});

	describe("arrayRecursive", () => {
		it("simple", () => {
			class ArrayRecursive extends schemaFactory.arrayRecursive("List", [
				() => ArrayRecursive,
			]) {}
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

		it("co-recursive", () => {
			class A extends schemaFactory.arrayRecursive("A", [() => B]) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}
			class B extends schemaFactory.arrayRecursive("B", A) {}
			{
				type _check = ValidateRecursiveSchema<typeof B>;
			}
			// Explicit constructor call
			{
				const data: A = hydrate(A, new A([]));
				assert.deepEqual([...data], []);
			}
		});

		it("co-recursive with object", () => {
			class A extends schemaFactory.arrayRecursive("A", [() => B]) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}
			class B extends schemaFactory.objectRecursive("B", { x: A }) {}
			{
				type _check = ValidateRecursiveSchema<typeof B>;
			}
			// Explicit constructor call
			{
				const data: A = hydrate(A, new A([]));
				assert.deepEqual([...data], []);
			}
		});

		it("co-recursive with object first", () => {
			class B extends schemaFactory.objectRecursive("B", { x: [() => A] }) {}
			{
				type _check = ValidateRecursiveSchema<typeof B>;
			}
			// It is interesting this compiles using "array" and does not need to be "arrayRecursive".
			// It is unclear if this should be considered supported, but it is currently working.
			// TODO: Determine exactly which cases like this work, why, and document they are supported.
			class A extends schemaFactory.array("A", B) {}
			// Explicit constructor call
			{
				const data: A = hydrate(A, new A([]));
				assert.deepEqual([...data], []);
			}
		});

		it("co-recursive object with out of line non-lazy subclassed array", () => {
			class TheArray extends schemaFactory.arrayRecursive("FooList", [() => Foo]) {}
			{
				type _check = ValidateRecursiveSchema<typeof TheArray>;
			}
			class Foo extends schemaFactory.objectRecursive("Foo", {
				fooList: TheArray,
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("recursive with subclassed array", () => {
			class FooList extends schemaFactory.arrayRecursive("FooList", [() => FooList]) {}
		});

		it("Node schema metadata", () => {
			const factory = new SchemaFactoryAlpha("");

			class Foo extends factory.arrayRecursive("FooList", [() => Foo], {
				metadata: {
					description: "A recursive list",
					custom: { baz: true },
				},
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}

			assert.deepEqual(Foo.metadata, {
				description: "A recursive list",
				custom: { baz: true },
			});

			// Ensure `Foo.metadata` is typed as we expect, and we can access its fields without casting.
			const baz = Foo.metadata.custom.baz;
			type _check1 = requireTrue<areSafelyAssignable<typeof baz, true>>;
		});
	});

	describe("mapRecursive", () => {
		class MapRecursive extends schemaFactory.mapRecursive("Map", [() => MapRecursive]) {}
		{
			type _check = ValidateRecursiveSchema<typeof MapRecursive>;
		}

		it("basic use", () => {
			const node = hydrate(MapRecursive, new MapRecursive([]));
			const data = [...node];
			assert.deepEqual(data, []);

			// Nested
			{
				type TInsert = InsertableTreeNodeFromImplicitAllowedTypes<typeof MapRecursive>;
				const _check: TInsert = new MapRecursive([]);

				// Only explicitly constructed recursive maps are currently allowed:
				type _check1 = requireTrue<areSafelyAssignable<TInsert, MapRecursive>>;

				// Check constructor
				type TBuild = NodeBuilderData<typeof MapRecursive>;
				type _check2 = requireAssignableTo<MapRecursive, TBuild>;
				type _check3 = requireAssignableTo<[], TBuild>;
				type _check4 = requireAssignableTo<[[string, TInsert]], TBuild>;
			}

			node.set("x", new MapRecursive([]));

			node.get("x")?.set("x", new MapRecursive(new Map()));
		});

		it("constructors", () => {
			const fromIterator = new MapRecursive([["x", new MapRecursive()]]);
			const fromMap = new MapRecursive(new Map([["x", new MapRecursive()]]));
			const fromObject = new MapRecursive({ x: new MapRecursive() });

			const fromNothing = new MapRecursive();
			const fromUndefined = new MapRecursive(undefined);

			// If supporting implicit construction, these would work:
			// @ts-expect-error Implicit construction disabled
			const fromNestedNeverArray = new MapRecursive({ x: [] });
			// @ts-expect-error Implicit construction disabled
			const fromNestedObject = new MapRecursive({ x: { x: [] } });
		});

		it("Node schema metadata", () => {
			const factory = new SchemaFactoryAlpha("");

			class Foo extends factory.mapRecursive("Foo", [() => Foo], {
				metadata: {
					description: "A recursive map",
					custom: { baz: true },
				},
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}

			assert.deepEqual(Foo.metadata, {
				description: "A recursive map",
				custom: { baz: true },
			});

			// Ensure `Foo.metadata` is typed as we expect, and we can access its fields without casting.
			const baz = Foo.metadata.custom.baz;
			type _check1 = requireTrue<areSafelyAssignable<typeof baz, true>>;
		});
	});

	describe("recordRecursive", () => {
		const schemaFactoryAlpha = new SchemaFactoryAlpha("recursive");
		class RecordRecursive extends schemaFactoryAlpha.recordRecursive("Record", [
			() => RecordRecursive,
		]) {}
		{
			type _check = ValidateRecursiveSchema<typeof RecordRecursive>;
		}

		it("basic use", () => {
			const node = hydrate(RecordRecursive, new RecordRecursive({}));
			const data = [...node];
			assert.deepEqual(data, []);

			// Nested
			{
				type TInsert = InsertableTreeNodeFromImplicitAllowedTypes<typeof RecordRecursive>;
				const _check: TInsert = new RecordRecursive({});

				// Only explicitly constructed recursive maps are currently allowed:
				type _check1 = requireTrue<areSafelyAssignable<TInsert, RecordRecursive>>;

				// Check constructor
				type TBuild = NodeBuilderData<typeof RecordRecursive>;
				type _check2 = requireAssignableTo<RecordRecursive, TBuild>;
				// eslint-disable-next-line @typescript-eslint/ban-types
				type _check3 = requireAssignableTo<{}, TBuild>;
				type _check4 = requireAssignableTo<{ a: RecordRecursive }, TBuild>;
				type _check5 = requireAssignableTo<Record<string, TInsert>, TBuild>;
			}

			node.x = new RecordRecursive();
			node.x.x = new RecordRecursive({});

			// This should not build, but it does.
			assert.throws(() => {
				node.y.x.z.q = new RecordRecursive({});
			}, validateTypeError("Cannot read properties of undefined (reading 'x')"));
		});

		it("constructors", () => {
			const fromObject = new RecordRecursive({ x: new RecordRecursive() });
			const fromNothing = new RecordRecursive();
			const fromUndefined = new RecordRecursive(undefined);

			// If supporting implicit construction, these would typ check:
			// @ts-expect-error Implicit construction disabled
			const fromNestedNeverArray = new RecordRecursive({ x: {} });
			// @ts-expect-error Implicit construction disabled
			const fromNestedObject = new RecordRecursive({ x: { x: {} } });
		});

		it("Node schema metadata", () => {
			const factory = new SchemaFactoryAlpha("");

			class Foo extends factory.recordRecursive("Foo", [() => Foo], {
				metadata: {
					description: "A recursive record",
					custom: { baz: true },
				},
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}

			assert.deepEqual(Foo.metadata, {
				description: "A recursive record",
				custom: { baz: true },
			});

			// Ensure `Foo.metadata` is typed as we expect, and we can access its fields without casting.
			const baz = Foo.metadata.custom.baz;
			type _check1 = requireTrue<areSafelyAssignable<typeof baz, true>>;
		});
	});

	/**
	 * Test various recursive object node cases with persisted metadata.
	 */
	it("Node schema persisted metadata", () => {
		// Example persistedMetadata containing a mix of primitives and objects
		const persistedMetadata = {
			a: "test",
			anObject: { baz: true },
		};

		// Test adding persistedMetadata to a recursive array schema
		const factory = new SchemaFactoryAlpha("");
		class Foos extends factory.arrayRecursive("Foos", [() => Foos], { persistedMetadata }) {}
		{
			type _check = ValidateRecursiveSchema<typeof Foos>;
		}
		assert.deepEqual(Foos.persistedMetadata, persistedMetadata);

		// Test adding persistedMetadata to a recursive object schema
		class Foo extends factory.objectRecursive(
			"Foo",
			{ fooList: [() => Foo] },
			{ persistedMetadata },
		) {}
		{
			type _check = ValidateRecursiveSchema<typeof Foo>;
		}
		assert.deepEqual(Foo.persistedMetadata, persistedMetadata);

		// Test adding persistedMetadata to a recursive map schema
		class FooMap extends factory.mapRecursive("FooMap", [() => FooMap], {
			persistedMetadata,
		}) {}
		{
			type _check = ValidateRecursiveSchema<typeof FooMap>;
		}
		assert.deepEqual(FooMap.persistedMetadata, persistedMetadata);
	});

	it("recursive under non-recursive", () => {
		class ArrayRecursive extends schemaFactory.arrayRecursive("List", [
			() => ArrayRecursive,
		]) {}
		{
			type _check = ValidateRecursiveSchema<typeof ArrayRecursive>;
		}
		class Root extends schemaFactory.object("Root", {
			r: ArrayRecursive,
		}) {}

		const r = hydrate(Root, { r: new ArrayRecursive([]) });
		assert.deepEqual([...r.r], []);
	});

	/**
	 * {@link ValidateRecursiveSchema} documents some specific patterns for how to write recursive schema.
	 * These patterns are not required for correct runtime behavior: they exist entirely to mitigate compiler limitations and bugs.
	 *
	 * This collection of tests, which violate these patterns, exists to help keep an eye on how these bugs are interacting with our schema.
	 *
	 * They help detect when changes (code, tooling or configuration) impact what compiles.
	 * This serves a few main purposes:
	 * 1. Changes to these tests can indicate when it might be worth making extra checks for similar supported cases to ensure they still compile.
	 * 2. Make it easier to communicate to customers which might have accidentally used these unsupported patterns when and how they might need to adjust their code.
	 * 3. Detect if/when the TypeScript compiler changes and starts to support these patterns to possibly enable out schema to explicitly allow them.
	 *
	 * Currently this collection of test cases covers one specific edge case: schema which do not use explicit sub-classing.
	 * Our current guidance says this pattern is not supported for recursive schema.
	 *
	 * These patterns also [break type safety in .d.ts generation](https://github.com/microsoft/TypeScript/issues/55832):
	 * this is one of the reasons they are not supported.
	 * The import-testing package has test coverage for this aspect.
	 * They also have poorer error quality and IntelliSense (for example the compiler and IntelliSense disagree on which are valid).
	 *
	 * These tests are all about the typing.
	 * They mostly check which cases TypeScript gives "referenced directly or indirectly in its own base expression" errors.
	 */
	describe("Use of recursive schema without explicit sub-classing", () => {
		it("recursive with non-subclassed array", () => {
			const FooList = schemaFactory.arrayRecursive("FooList", [() => FooList]);
		});

		it("co-recursive object with out of line non-lazy array", () => {
			// @ts-expect-error co-recursive arrays without named subclass cause "referenced directly or indirectly in its own base expression" errors.
			const TheArray = schemaFactory.arrayRecursive("FooList", [() => Foo]);
			{
				// In this case the error above does not cause ValidateRecursiveSchema to fail to compile.
				// It's interesting that is not consistent with the other cases below,
				// but doesn't seem to matter from a customer perspective since they already have a compile error, and other than that error,
				// nothing else is wrong (the schema would work fine at runtime).
				type _check = ValidateRecursiveSchema<typeof TheArray>;
			}

			// @ts-expect-error due to error above
			class Foo extends schemaFactory.objectRecursive("Foo", {
				fooList: TheArray,
			}) {}
			{
				// @ts-expect-error due to error above
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive object with inline array", () => {
			// @ts-expect-error Inline co-recursive arrays without named subclass cause "referenced directly or indirectly in its own base expression" errors.
			class Foo extends schemaFactory.objectRecursive("Foo", {
				// @ts-expect-error due to error above
				fooList: schemaFactory.arrayRecursive("FooList", [() => Foo]),
			}) {}
			{
				// @ts-expect-error due to error above
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive object with inline array class ", () => {
			// @ts-expect-error Inlining an anonymous class does not help
			class Foo extends schemaFactory.objectRecursive("Foo", {
				// @ts-expect-error Implicit any due to error above
				fooList: class extends schemaFactory.arrayRecursive("FooList", [() => Foo]) {},
			}) {}
			{
				// @ts-expect-error due to error above
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive object with inline array lazy", () => {
			class Foo extends schemaFactory.objectRecursive("Foo", {
				fooList: [() => schemaFactory.arrayRecursive("FooList", [() => Foo])],
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive map with inline array", () => {
			// @ts-expect-error Inline non-lazy co-recursive arrays cause "referenced directly or indirectly in its own base expression" errors.
			class Foo extends schemaFactory.mapRecursive(
				"Foo",
				// @ts-expect-error Implicit any due to error above
				schemaFactory.arrayRecursive("FooList", [() => Foo]),
			) {}
			{
				// @ts-expect-error due to error above
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive map with inline array lazy", () => {
			class Foo extends schemaFactory.mapRecursive("Foo", [
				() => schemaFactory.arrayRecursive("FooList", [() => Foo]),
			]) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive array with inline array", () => {
			// @ts-expect-error Inline non-lazy co-recursive arrays cause "referenced directly or indirectly in its own base expression" errors.
			class Foo extends schemaFactory.arrayRecursive(
				"Foo",
				// @ts-expect-error Implicit any due to error above
				schemaFactory.arrayRecursive("FooList", [() => Foo]),
			) {}
			{
				// @ts-expect-error due to error above
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive array with inline array lazy", () => {
			class Foo extends schemaFactory.arrayRecursive("Foo", [
				() => schemaFactory.arrayRecursive("FooList", [() => Foo]),
			]) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive map with inline map", () => {
			class Foo extends schemaFactory.mapRecursive(
				"Foo",
				schemaFactory.mapRecursive("FooList", [() => Foo]),
			) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});

		it("co-recursive map with inline map lazy", () => {
			class Foo extends schemaFactory.mapRecursive("Foo", [
				() => schemaFactory.mapRecursive("FooList", [() => Foo]),
			]) {}
			{
				type _check = ValidateRecursiveSchema<typeof Foo>;
			}
		});
	});
});
