/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	typeNameSymbol,
	typeSchemaSymbol,
	type LeafSchema,
	type NodeBuilderData,
	type ObjectNodeSchema,
	type SimpleObjectNodeSchema,
	type TreeNodeSchema,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import type {
	FieldHasDefault,
	InsertableObjectFromSchemaRecord,
	ObjectFromSchemaRecord,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/objectNode.js";
import { describeHydration, hydrate, pretty } from "./utils.js";
import type {
	areSafelyAssignable,
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	requireTrue,
	RestrictiveStringRecord,
} from "../../util/index.js";
import { getView, validateUsageError } from "../utils.js";
import { Tree } from "../../shared-tree/index.js";
import type {
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	InsertableTreeNodeFromAllowedTypes,
	InsertableTypedNode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaTypes.js";

const schemaFactory = new SchemaFactory("Test");

// InsertableObjectFromSchemaRecord
{
	class Note extends schemaFactory.object("Note", {}) {}

	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	type Info = {
		readonly stuff: readonly [typeof Note];
	};

	type Desired = InsertableTypedNode<typeof Note>;

	{
		type result = InsertableObjectFromSchemaRecord<Info>["stuff"];
		type _check = requireTrue<areSafelyAssignable<result, Desired>>;
	}

	{
		type result = InsertableTreeFieldFromImplicitField<Info["stuff"]>;
		type _check = requireTrue<areSafelyAssignable<result, Desired>>;
	}

	// Generic case
	{
		type result = InsertableObjectFromSchemaRecord<
			RestrictiveStringRecord<ImplicitFieldSchema>
		>;
		type _check = requireAssignableTo<result, never>;
	}

	// Empty case
	{
		// eslint-disable-next-line @typescript-eslint/ban-types
		type result = InsertableObjectFromSchemaRecord<{}>;
		type _check = requireAssignableTo<result, Record<string, never>>;
	}
}

// FieldHasDefault
{
	class Note extends schemaFactory.object("Note", {}) {}

	{
		type _check = requireFalse<FieldHasDefault<ImplicitAllowedTypes>>;
		type _check2 = requireFalse<FieldHasDefault<ImplicitFieldSchema>>;
	}

	// Node schema via ImplicitAllowedTypes
	{
		// Implicitly required field does not have a default value.
		type _check = requireFalse<FieldHasDefault<typeof Note>>;
	}

	// Required field
	{
		type RequiredNoteField = FieldSchema<FieldKind.Required, typeof Note>;

		// Required field does not have a default value.
		type _check = requireFalse<FieldHasDefault<RequiredNoteField>>;
	}

	// Optional field
	{
		type OptionalNoteField = FieldSchema<FieldKind.Optional, typeof Note>;

		// Optional field has default.
		type _check = requireTrue<FieldHasDefault<OptionalNoteField>>;
	}

	// Identifier field
	{
		type IdentifierField = FieldSchema<FieldKind.Identifier, typeof SchemaFactory.string>;

		// Identifier fields have default.
		type _check = requireTrue<FieldHasDefault<IdentifierField>>;
	}

	// Union of required fields
	{
		type RequiredNoteField = FieldSchema<FieldKind.Required, typeof Note>;
		type ImplicitlyRequiredStringField = typeof SchemaFactory.string;
		type Union = RequiredNoteField | ImplicitlyRequiredStringField;

		// Field definitively does not have a default value.
		type _check = requireFalse<FieldHasDefault<Union>>;
	}

	// Union of optional fields
	{
		type OptionalNoteField = FieldSchema<FieldKind.Optional, typeof Note>;
		type IdentifierField = FieldSchema<FieldKind.Identifier, typeof SchemaFactory.string>;
		type Union = OptionalNoteField | IdentifierField;

		// Field definitively has a default value.
		type _check = requireTrue<FieldHasDefault<Union>>;
	}

	// Union of required and optional fields
	{
		type RequiredNoteField = FieldSchema<FieldKind.Required, typeof Note>;
		type IdentifierField = FieldSchema<FieldKind.Identifier, typeof SchemaFactory.string>;
		type Union = RequiredNoteField | IdentifierField;

		// Field may or may not have a default value.
		type _check = requireFalse<FieldHasDefault<Union>>;
	}
}

// ObjectFromSchemaRecord
{
	// Generic case
	{
		type result = ObjectFromSchemaRecord<RestrictiveStringRecord<ImplicitFieldSchema>>;
		// eslint-disable-next-line @typescript-eslint/ban-types
		type _check = requireTrue<areSafelyAssignable<{}, result>>;

		type _check3 = requireTrue<isAssignableTo<{ x: unknown }, result>>;
	}

	// Empty case
	{
		// eslint-disable-next-line @typescript-eslint/ban-types
		type result = ObjectFromSchemaRecord<{}>;
		// eslint-disable-next-line @typescript-eslint/ban-types
		type _check = requireTrue<areSafelyAssignable<{}, result>>;
		type _check2 = requireFalse<isAssignableTo<result, { x: unknown }>>;

		type _check3 = requireTrue<isAssignableTo<{ x: unknown }, result>>;
	}
}

describeHydration(
	"ObjectNode",
	(init) => {
		describe("shadowing", () => {
			describe("constructor", () => {
				it("empty", () => {
					class Schema extends schemaFactory.object("x", {}) {}
					const n = init(Schema, {});
					// constructor is a special case, since one is built in on the derived type.
					// Check that it is exposed as expected based on type:
					const x = n.constructor;
					// eslint-disable-next-line @typescript-eslint/ban-types
					type check_ = requireAssignableTo<typeof x, Function>;
					assert.equal(x, Schema);
				});

				it("required", () => {
					class Schema extends schemaFactory.object("x", {
						constructor: schemaFactory.number,
					}) {}

					const n = init(Schema, { constructor: 5 });

					const x = n.constructor;
					type check_ = requireAssignableTo<typeof x, number>;
					assert.equal(x, 5);
				});

				describe("optional", () => {
					class Schema extends schemaFactory.object("x", {
						constructor: schemaFactory.optional(schemaFactory.number),
					}) {}

					it("explicit undefined", () => {
						const n = init(Schema, { constructor: undefined });
						const x = n.constructor;
						type check_ = requireAssignableTo<typeof x, number | undefined>;
						assert.equal(x, undefined);
					});

					it("default", () => {
						// Example of how a type conversion that allows using literals with defaults can still be allowed to compile in the presence of overloaded inherited values.
						const data: { [P in "constructor"]?: undefined } = {};
						const insertable: NodeBuilderData<typeof Schema> = data;

						const n = init(Schema, insertable);
						const x = n.constructor;
						assert.equal(x, undefined);

						{
							// In this particular case of overloads, TypeScript knows this is unsafe, but in other similar cases (like the one above), it can compile without error.
							// @ts-expect-error Unsafely construct insertable with correct type.
							const _insertable: NodeBuilderData<typeof Schema> = {};
						}
					});
				});
			});

			it("union", () => {
				class Schema extends schemaFactory.object("x", {
					constructor: schemaFactory.number,
				}) {}
				class Other extends schemaFactory.object("y", {
					other: schemaFactory.number,
				}) {}

				// TODO:
				// "init" can't handle field schema, so this uses hydrate, making the two versions of this test the same.
				// Either:
				// 1. Generalize init
				// 2. Reorganize these tests to avoid hitting this requirement
				// 3. Some other refactor to resolve this
				const a = hydrate([Schema, Other], { constructor: 5 });
				const b = hydrate([Schema, Other], { other: 6 });

				// eslint-disable-next-line @typescript-eslint/ban-types
				type check_ = requireAssignableTo<typeof a.constructor, number | Function>;
				assert.equal(a.constructor, 5);
				assert.equal(b.constructor, Other);
				assert(Tree.is(b, Other));
				assert.equal(b.other, 6);
			});
		});

		describe("setting a local field", () => {
			it("throws TypeError in POJO emulation mode", () => {
				const root = init(schemaFactory.object("no fields", {}), {});
				assert.throws(() => {
					// The actual error "'TypeError: 'set' on proxy: trap returned falsish for property 'foo'"
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(root as unknown as any).foo = 3;
				}, "attempting to set an invalid field must throw.");
			});

			it("works in Customizable mode", () => {
				class Custom extends schemaFactory.object("no fields", {}) {
					public foo?: number;
				}
				const root = init(Custom, {});
				root.foo = 3;
			});
		});

		describe("deep equality and types", () => {
			it("types are ignored in POJO emulation mode", () => {
				const a = init(schemaFactory.object("a", {}), {});
				const b = init(schemaFactory.object("b", {}), {});
				assert.deepEqual(a, {});
				assert.deepEqual(a, b);
			});

			it("types are compared in Customizable mode", () => {
				class A extends schemaFactory.object("a", {}) {}
				class B extends schemaFactory.object("b", {}) {}
				const a = init(A, {});
				const b = init(B, {});
				assert.notDeepEqual(a, {});
				assert.notDeepEqual(a, b);
				const a2 = init(A, {});
				assert.deepEqual(a, a2);
			});
		});

		describe("properties", () => {
			it("empty property pojo deep equals", () => {
				const Schema = schemaFactory.object("x", {
					foo: schemaFactory.optional(schemaFactory.number),
				});
				const n = init(Schema, { foo: undefined });
				assert.deepEqual(n, {});
			});

			it("empty property enumerability", () => {
				class Schema extends schemaFactory.object("x", {
					foo: schemaFactory.optional(schemaFactory.number),
				}) {}
				const n = init(Schema, { foo: undefined });
				assert.deepEqual({ ...n }, {});
				const descriptor = Reflect.getOwnPropertyDescriptor(n, "foo") ?? assert.fail();
				assert.equal(descriptor.enumerable, false);
				assert.equal(descriptor.value, undefined);
				const keys = Object.keys(n);
				assert.deepEqual(keys, []);
			});

			it("full property enumerability", () => {
				class Schema extends schemaFactory.object("x", {
					foo: schemaFactory.optional(schemaFactory.number),
				}) {}
				const n = init(Schema, { foo: 0 });
				assert.deepEqual({ ...n }, { foo: 0 });
				const descriptor = Reflect.getOwnPropertyDescriptor(n, "foo") ?? assert.fail();
				assert.equal(descriptor.enumerable, true);
				assert.equal(descriptor.value, 0);
				const keys = Object.keys(n);
				assert.deepEqual(keys, ["foo"]);
			});

			it("delete operator", () => {
				class Schema extends schemaFactory.object("x", {
					foo: schemaFactory.optional(schemaFactory.number),
				}) {}
				const n = init(Schema, { foo: 0 });
				assert.throws(
					() => {
						// Since we do not have exactOptionalPropertyTypes enabled, this compiles, but should error at runtime:
						delete n.foo;
					},
					validateUsageError(/delete operator/),
				);
			});

			it("assigning identifier errors", () => {
				class HasId extends schemaFactory.object("hasID", {
					id: schemaFactory.identifier,
				}) {}
				const n = init(HasId, {});
				assert.throws(() => {
					// TODO: AB:9129: this should not compile
					n.id = "x";
				});
			});
		});

		// Regression test for accidental use of ?? preventing null values from being read correctly.
		it("can read null field", () => {
			class Root extends schemaFactory.object("", {
				x: schemaFactory.null,
			}) {}
			const node = init(Root, { x: null });
			assert.equal(node.x, null);
		});

		describe("supports setting fields", () => {
			describe("primitives", () => {
				it("required", () => {
					class Root extends schemaFactory.object("", {
						x: schemaFactory.number,
					}) {}
					const node = init(Root, { x: 5 });
					assert.equal(node.x, 5);
					node.x = 6;
					assert.equal(node.x, 6);
				});

				it("optional", () => {
					class Root extends schemaFactory.object("", {
						y: schemaFactory.optional(schemaFactory.number),
					}) {}
					const node = init(Root, {});
					assert.equal(node.y, undefined);
					node.y = 6;
					assert.equal(node.y, 6);
					node.y = undefined;
					assert.equal(node.y, undefined);
				});

				it("invalid normalize numbers", () => {
					class Root extends schemaFactory.object("", {
						x: [schemaFactory.number, schemaFactory.null],
					}) {}
					const node = init(Root, { x: Number.NaN });
					assert.equal(node.x, null);
					node.x = 6;
					assert.equal(node.x, 6);
					node.x = Number.POSITIVE_INFINITY;
					assert.equal(node.x, null);
					node.x = -0;
					assert(Object.is(node.x, 0));
				});

				it("invalid numbers error", () => {
					class Root extends schemaFactory.object("", {
						x: schemaFactory.number,
					}) {}
					const node = init(Root, { x: 1 });
					assert.throws(() => {
						node.x = Number.NaN;
					}, validateUsageError(/NaN/));
					assert.equal(node.x, 1);
					node.x = -0;
					assert(Object.is(node.x, 0));
				});
			});

			describe("required TreeNode", () => {
				const Child = schemaFactory.object("child", {
					objId: schemaFactory.number,
				});
				const Schema = schemaFactory.object("parent", {
					child: Child,
				});

				const before = { objId: 0 };
				const after = { objId: 1 };

				it(`(${pretty(before)} -> ${pretty(after)})`, () => {
					const root = init(Schema, { child: before });
					assert.equal(root.child.objId, 0);
					root.child = new Child(after);
					assert.equal(root.child.objId, 1);
				});
			});

			describe("optional TreeNode", () => {
				const Child = schemaFactory.object("child", {
					objId: schemaFactory.number,
				});
				const Schema = schemaFactory.object("parent", {
					child: schemaFactory.optional(Child),
				});

				const before = { objId: 0 };
				const after = { objId: 1 };

				it(`(undefined -> ${pretty(before)} -> ${pretty(after)})`, () => {
					const root = init(Schema, { child: undefined });
					assert.equal(root.child, undefined);
					root.child = new Child(before);
					assert.equal(root.child.objId, 0);
					root.child = new Child(after);
					assert.equal(root.child.objId, 1);
				});
			});

			it("identifier", () => {
				class Schema extends schemaFactory.object("parent", {
					id: schemaFactory.identifier,
				}) {}
				const root = init(Schema, { id: "a" });
				assert.throws(() => {
					// TODO: AB#35799 this should not compile!
					// If it does compile, it must be a UsageError.
					root.id = "b";
				});
			});
		});

		it("default optional field", () => {
			class Schema extends schemaFactory.object("x", {
				x: schemaFactory.optional(schemaFactory.number),
			}) {}
			const n = init(Schema, {});
			assert.equal(n.x, undefined);
		});
	},
	() => {
		it("Construction regression test", () => {
			class Note extends schemaFactory.object("Note", {}) {}

			class Canvas extends schemaFactory.object("Canvas", { stuff: [Note] }) {}

			const y = new Note({});

			const x = new Canvas({
				stuff: {},
			});

			const allowed = [Note] as const;
			{
				type X = InsertableTreeNodeFromAllowedTypes<typeof allowed>;
				const test: X = {};
			}
		});

		it("ObjectNodeSchema", () => {
			const sf = new SchemaFactoryAlpha("Test");
			class Note extends sf.object("Note", { f: SchemaFactory.null }) {}
			class EmptyObject extends sf.object("Note", {}) {}

			const schema: ObjectNodeSchema = Note;
			const schemaEmpty: ObjectNodeSchema = EmptyObject;

			// @ts-expect-error Cannot call constructor with unknown schema
			const note = new schema({ f: null });
			// @ts-expect-error Cannot call constructor with unknown schema
			const empty = new schemaEmpty({});

			assert.deepEqual(
				Note.fields.get("f")?.allowedTypesIdentifiers,
				new Set([SchemaFactory.null.identifier]),
			);

			// Explicit field
			{
				class ExplicitField extends sf.object("WithField", {
					f: sf.optional([() => SchemaFactory.null]),
				}) {}

				type Info = (typeof ExplicitField)["info"];
				const _check1: TreeNodeSchema = ExplicitField;
				const _check2: ObjectNodeSchema = ExplicitField;
			}

			// Non implicitly constructable
			{
				type TestObject = ObjectNodeSchema<
					"x",
					RestrictiveStringRecord<ImplicitFieldSchema>,
					false
				>;
				type _check1 = requireAssignableTo<TestObject, TreeNodeSchema>;
				type _check2 = requireAssignableTo<TestObject, ObjectNodeSchema>;
			}

			// Recursive
			{
				class RecursiveTest extends sf.objectRecursive("RecursiveTest", {
					f: sf.optionalRecursive([() => RecursiveTest]),
				}) {}
				{
					type _check = ValidateRecursiveSchema<typeof RecursiveTest>;
				}

				type Info = (typeof RecursiveTest)["info"];
				type Info2 = ObjectNodeSchema["info"];
				type _check2 = requireAssignableTo<Info, Info2>;
				const _check1: TreeNodeSchema = RecursiveTest;
				const _check2: ObjectNodeSchema = RecursiveTest;
			}

			// Empty POJO mode
			{
				const Empty = sf.object("Empty", {});

				type Info = (typeof Empty)["info"];
				const _check1: TreeNodeSchema = Empty;
				const _check2: ObjectNodeSchema = Empty;
			}

			// POJO mode with field
			{
				const ExplicitField = sf.object("WithField", {
					f: SchemaFactory.null,
				});

				type Info = (typeof ExplicitField)["info"];
				const _check1: TreeNodeSchema = ExplicitField;
				// This tests the workaround in SchemaFactoryAlpha.object.
				// This line fails to compile without the workaround.
				const _check2: ObjectNodeSchema = ExplicitField;
			}

			// Explicit field POJO mode typing unit tests
			{
				type SchemaType = ObjectNodeSchema<string, { readonly f: LeafSchema<"null", null> }>;
				// @ts-expect-error Missing workaround for https://github.com/microsoft/TypeScript/issues/59049#issuecomment-2773459693 so this fails.
				type _check4 = requireAssignableTo<SchemaType, ObjectNodeSchema>;
				// It does work for the different types that make up ObjectNodeSchema however:
				type _check5 = requireAssignableTo<SchemaType, SimpleObjectNodeSchema>;
			}

			// ObjectNodeSchema assignability bug minimization
			{
				type RecordX = Record<string, unknown>;

				// A type with complicated variance.
				type Create<T extends RecordX> = (data: RecordX extends T ? never : T) => unknown;

				// Two identical interfaces
				interface X1<T extends RecordX = RecordX> extends Create<T> {}
				interface X2<T extends RecordX = RecordX> extends Create<T> {}

				// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
				type Input = { f: object };
				// Compute two identical types using X1 and X2
				type Result1 = X1<Input>;
				type Result2 = X2<Input>;

				// The identical types are not equal, nor are the identical interfaces.
				type _check12 = requireAssignableTo<Result1, X2>;
				// @ts-expect-error Missing workaround for https://github.com/microsoft/TypeScript/issues/59049#issuecomment-2773459693 so this fails.
				type _check11 = requireAssignableTo<Result1, X1>; // Result from X1 is not assignable to X1, only X2
				// @ts-expect-error Missing workaround for https://github.com/microsoft/TypeScript/issues/59049#issuecomment-2773459693 so this fails.
				type _check22 = requireAssignableTo<Result2, X2>; // Result from X2 is not assignable to X2, only X1
				type _check21 = requireAssignableTo<Result2, X1>;
			}
		});

		describe("shadowing", () => {
			it("optional shadowing builtin", () => {
				class Schema extends schemaFactory.object("x", {
					toString: schemaFactory.optional(schemaFactory.number),
				}) {}
				{
					const n = hydrate(Schema, { toString: 1 });
					assert.equal(n.toString, 1);
					n.toString = undefined;
					assert.equal(n.toString, undefined);
				}

				{
					const n = hydrate(Schema, { toString: undefined });
					const x = n.toString;
					assert.equal(x, undefined);
				}
			});

			it("optional incompatible shadowing", () => {
				class Schema extends schemaFactory.object("x", {
					foo: schemaFactory.optional(schemaFactory.number),
				}) {
					// @ts-expect-error incompatible shadowed field errors.
					public foo(): void {}
				}
			});

			it("optional custom shadowing", () => {
				class Schema extends schemaFactory.object("x", {
					foo: schemaFactory.optional(schemaFactory.number),
				}) {
					// Since fields are own properties, we expect inherited properties (like this) to be shadowed by fields.
					// However in TypeScript they work like inherited properties, so the types don't make the runtime behavior.
					// eslint-disable-next-line @typescript-eslint/class-literal-property-style
					public override get foo(): 5 {
						return 5;
					}
				}
				function typeTest() {
					const n = hydrate(Schema, { foo: 1 });
					assert.equal(n.foo, 1);
					// @ts-expect-error TypeScript typing does not understand that fields are own properties and thus shadow the getter here.
					n.foo = undefined;
				}

				function typeTest2() {
					const n = hydrate(Schema, { foo: undefined });
					const x = n.foo;
					// TypeScript is typing the "foo" field based on the getter not the field, which does not match runtime behavior.
					type check_ = requireAssignableTo<typeof x, 5>;
				}

				assert.throws(
					() => new Schema({ foo: undefined }),
					(e: Error) => validateAssertionError(e, /this shadowing will not work/),
				);
			});
		});

		describe("properties", () => {
			it("accessor local properties", () => {
				const thisList: unknown[] = [];
				class Test extends schemaFactory.object("test", {
					x: schemaFactory.number,
				}) {
					public get y() {
						assert.equal(this, n);
						thisList.push(this);
						return this.x;
					}
					public set y(value: number) {
						assert.equal(this, n);
						thisList.push(this);
						this.x = value;
					}
				}

				const n = hydrate(Test, { x: 1 });
				n.y = 2;
				assert.equal(n.x, 2);
				n.x = 3;
				assert.equal(n.y, 3);
				assert.deepEqual(thisList, [n, n]);
			});

			describe("hydrated field property access allocation tests", () => {
				it("accessing leaf on object node does not allocate flex nodes", () => {
					class TreeWithLeaves extends schemaFactory.object("TreeWithLeaves", {
						leaf: SchemaFactory.number,
					}) {}
					const config = new TreeViewConfiguration({ schema: TreeWithLeaves });
					const view = getView(config);
					view.initialize({ leaf: 1 });
					const context = view.getView().context;
					// Note: access the root before trying to access just the leaf, to not count any object allocations that result from
					// accessing the root as part of the allocations from the leaf access. Also, store it to avoid additional computation
					// from any intermediate getters when accessing the leaf.
					const root = view.root;
					const countBefore = context.withAnchors.size;
					const _accessLeaf = root.leaf;
					const countAfter = context.withAnchors.size;

					// As of 2024-07-01 we still allocate flex fields when accessing leaves, so the after-count is expected to be one higher
					// than the before count.
					// TODO: if/when we stop allocating flex fields when accessing leaves, this test will fail and should be updated so
					// the two counts match, plus its title updated accordingly.
					assert.equal(countAfter, countBefore + 1);
				});

				it("accessing leaf on map node does not allocate flex nodes", () => {
					class TreeWithLeaves extends schemaFactory.map(
						"MapOfLeaves",
						SchemaFactory.number,
					) {}
					const config = new TreeViewConfiguration({ schema: TreeWithLeaves });
					const view = getView(config);
					view.initialize(new Map([["1", 1]]));
					const context = view.getView().context;
					// Note: access the map that contains leaves before trying to access just the leaf at one of the keys, to not
					// count any object allocations that result from accessing the root/map as part of the allocations from the leaf
					// access. Also, store it to avoid additional computation from any intermediate getters when accessing the leaf.
					const root = view.root;
					const countBefore = context.withAnchors.size;
					const _accessLeaf = root.get("1");
					const countAfter = context.withAnchors.size;

					// As of 2024-07-01 we still allocate flex fields when accessing leaves, so the after-count is expected to be one higher
					// than the before count.
					// TODO: if/when we stop allocating flex fields when accessing leaves, this test will fail and should be updated so
					// the two counts match, plus its title updated accordingly.
					assert.equal(countAfter, countBefore + 1);
				});

				it("accessing leaf on array node does not allocate flex nodes", () => {
					class TreeWithLeaves extends schemaFactory.array(
						"ArrayOfLeaves",
						SchemaFactory.number,
					) {}
					const config = new TreeViewConfiguration({ schema: TreeWithLeaves });
					const view = getView(config);
					view.initialize([1, 2]);
					const context = view.getView().context;
					// Note: prior to taking the "before count", access the array that contains leaves *and the first leaf in it*,
					// to ensure that the sequence field for the array is allocated and accounted for. We expect the sequence field
					// to be required anyway (vs the field for a leaf property on an object node, for example, where we might be able
					// to optimize away its allocation) so might as well count it up front. The subsequent access to the second leaf
					// should then not allocate anything new.
					// Also, store the array/root to avoid additional computation from any intermediate getters when accessing leaves.
					const root = view.root;
					const _accessLeaf0 = root[0];
					const countBefore = context.withAnchors.size;
					const _accessLeaf1 = root[1];
					const countAfter = context.withAnchors.size;

					// The array test is deliberately distinct from the object and map ones, see the comment above for the rationale.
					assert.equal(countAfter, countBefore);
				});
			});
		});

		it("unhydrated default identifier access errors", () => {
			class HasId extends schemaFactory.object("hasID", { id: schemaFactory.identifier }) {}
			const newNode = new HasId({});
			assert.throws(
				() => {
					const id = newNode.id;
				},
				validateUsageError(/identifier/),
			);
		});

		it("unhydrated default identifier access via shortId errors", () => {
			class HasId extends schemaFactory.object("hasID", { id: schemaFactory.identifier }) {}
			const newNode = new HasId({});
			assert.throws(
				() => {
					const id = Tree.shortId(newNode);
				},
				validateUsageError(
					/Tree.shortId cannot access default identifiers on unhydrated nodes/,
				),
			);
		});

		it("unhydrated custom identifier access works", () => {
			class HasId extends schemaFactory.object("hasID", { id: schemaFactory.identifier }) {}
			const newNode = new HasId({ id: "x" });
			assert.equal(newNode.id, "x");
			assert.equal(Tree.shortId(newNode), "x");
		});

		it("custom identifier access works on POJO mode object", () => {
			const HasId = schemaFactory.object("hasID", { id: schemaFactory.identifier });
			const newNode = new HasId({ id: "x" });
			assert.equal(newNode.id, "x");
			assert.equal(Tree.shortId(newNode), "x");
		});

		it("schema access POJO", () => {
			const Pojo = schemaFactory.object("A", {});
			const node = new Pojo({});
			assert.equal(Tree.schema(node), Pojo);
			assert.equal(node[typeNameSymbol], Pojo.identifier);
			assert.equal(node[typeSchemaSymbol], Pojo);
		});

		it("schema access Customizable", () => {
			const Customizable = schemaFactory.object("A", {});
			const node = new Customizable({});
			assert.equal(Tree.schema(node), Customizable);
			assert.equal(node[typeNameSymbol], Customizable.identifier);
			assert.equal(node[typeSchemaSymbol], Customizable);
		});

		it("Build Parameter unexpected properties", () => {
			class A extends schemaFactory.object("A", {}) {}
			class B extends schemaFactory.object("B", { a: schemaFactory.number }) {}

			const a = new A({});
			const b = new B({ a: 1 });

			// @ts-expect-error "Object literal may only specify known properties"
			const a2 = new A({ thisDoesNotExist: 5 });

			// @ts-expect-error "Object literal may only specify known properties"
			const b3 = new B({ a: 1, thisDoesNotExist: 5 });

			type BuildA = NodeBuilderData<typeof A>;
			type BuildB = NodeBuilderData<typeof B>;

			// @ts-expect-error "Object literal may only specify known properties"
			const builderA: BuildA = { thisDoesNotExist: 5 };
			// @ts-expect-error "Object literal may only specify known properties"
			const builderB: BuildB = { a: 1, thisDoesNotExist: 5 };
		});
	},
);
