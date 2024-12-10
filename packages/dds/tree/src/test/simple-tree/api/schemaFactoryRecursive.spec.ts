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
	withMetadata,
} from "../../../simple-tree/index.js";
import type {
	ValidateRecursiveSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/schemaFactoryRecursive.js";
import type {
	FieldSchemaUnsafe,
	InsertableTreeFieldFromImplicitFieldUnsafe,
	InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	TreeFieldFromImplicitFieldUnsafe,
	TreeNodeFromImplicitAllowedTypesUnsafe,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/typesUnsafe.js";
import { TreeFactory } from "../../../treeFactory.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
	requireFalse,
} from "../../../util/index.js";

import { hydrate } from "../utils.js";

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
				? ApplyKindInput<TreeNodeFromImplicitAllowedTypes<Types>, Kind, false>
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
				? ApplyKindInput<TreeNodeFromImplicitAllowedTypes<Types>, Kind, false>
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
			class Other extends sf.array("Other", sf.number) {}
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

		it("Node schema metadata", () => {
			const factory = new SchemaFactory("");

			class Foo extends withMetadata(factory.objectRecursive("Foo", { bar: () => Bar }), {
				description: "A recursive object called Foo",
				custom: { baz: true },
			}) {}
			class Bar extends withMetadata(factory.objectRecursive("Bar", { foo: () => Foo }), {
				description: "A recursive object called Bar",
				custom: { baz: false },
			}) {}

			assert.deepEqual(Foo.metadata, {
				description: "A recursive object called Foo",
				custom: { baz: true },
			});
			assert.deepEqual(Bar.metadata, {
				description: "A recursive object called Bar",
				custom: { baz: false },
			});
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

		it("co-recursive", () => {
			class A extends sf.arrayRecursive("A", [() => B]) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}
			class B extends sf.arrayRecursive("B", A) {}
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
			class A extends sf.arrayRecursive("A", [() => B]) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}
			class B extends sf.objectRecursive("B", { x: A }) {}
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
			class B extends sf.objectRecursive("B", { x: [() => A] }) {}
			{
				type _check = ValidateRecursiveSchema<typeof B>;
			}
			class A extends sf.array("A", B) {}
			// Explicit constructor call
			{
				const data: A = hydrate(A, new A([]));
				assert.deepEqual([...data], []);
			}
		});

		it("Node schema metadata", () => {
			const factory = new SchemaFactory("");

			class Foo extends factory.objectRecursive("Foo", {
				fooList: sf.arrayRecursive("FooList", [() => Foo]),
			}) {}
			class FooList extends withMetadata(factory.arrayRecursive("FooList", [() => Foo]), {
				description: "A recursive list",
				custom: { baz: true },
			}) {}

			assert.deepEqual(FooList.metadata, {
				description: "A recursive list",
				custom: { baz: true },
			});
		});
	});

	describe("mapRecursive", () => {
		class MapRecursive extends sf.mapRecursive("Map", [() => MapRecursive]) {}
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
			const factory = new SchemaFactory("");

			class Foo extends factory.objectRecursive("Foo", {
				fooList: sf.arrayRecursive("FooList", [() => Foo]),
			}) {}
			class FooList extends withMetadata(factory.mapRecursive("FooList", [() => Foo]), {
				description: "A recursive map",
				custom: { baz: true },
			}) {}

			assert.deepEqual(FooList.metadata, {
				description: "A recursive map",
				custom: { baz: true },
			});
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
