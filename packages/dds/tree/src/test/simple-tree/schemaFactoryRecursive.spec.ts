/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";
import { createIdCompressor } from "@fluidframework/id-compressor";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	ApplyKind,
	FieldSchema,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeFromSchema,
	SchemaFactoryRecursive,
	TreeConfiguration,
	TreeNodeFromImplicitAllowedTypes,
	TreeView,
} from "../../simple-tree/index.js";
import { TreeFactory } from "../../treeFactory.js";
import { areSafelyAssignable, requireAssignableTo, requireTrue } from "../../util/index.js";
import { FlexListToUnion } from "../../feature-libraries/index.js";
import {
	FieldSchemaUnsafe,
	InsertableTreeFieldFromImplicitFieldUnsafe,
	InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	TreeFieldFromImplicitFieldUnsafe,
	TreeNodeFromImplicitAllowedTypesUnsafe,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaFactoryRecursive.js";
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

const sf = new SchemaFactoryRecursive("recursive");

describe("SchemaFactoryRecursive", () => {
	describe("objectRecursive", () => {
		it("End-to-end with recursive object", () => {
			const factory = new TreeFactory({});
			const schema = new SchemaFactoryRecursive("com.example");

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

			const config = new TreeConfiguration(
				Box,
				() => new Box({ text: "hi", child: undefined }),
			);

			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);

			const view: TreeView<Box> = tree.schematize(config);
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

		it("objects", () => {
			class ObjectRecursive extends sf.objectRecursive("Object", {
				x: sf.optionalRecursive([() => ObjectRecursive]),
			}) {}

			type XSchema = typeof ObjectRecursive.info.x;
			type Field2 = XSchema extends FieldSchema<infer Kind, infer Types>
				? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind>
				: "zzz";
			type XTypes = XSchema extends FieldSchemaUnsafe<infer Kind, infer Types> ? Types : "Q";
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
						{
							readonly x: undefined | ObjectRecursive;
						},
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

	describe("arrayRecursive", () => {
		it("simple", () => {
			class ArrayRecursive extends sf.arrayRecursive("List", [() => ArrayRecursive]) {}
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
		class Root extends sf.object("Root", {
			r: ArrayRecursive,
		}) {}

		const r = hydrate(Root, { r: new ArrayRecursive([]) });
		assert.deepEqual([...r.r], []);
	});
});
