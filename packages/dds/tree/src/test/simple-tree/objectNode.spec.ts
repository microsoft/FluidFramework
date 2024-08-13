/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { SchemaFactory, type NodeKind, type TreeNodeSchema } from "../../simple-tree/index.js";

import { describeHydration, hydrate, pretty } from "./utils.js";
import type { requireAssignableTo } from "../../util/index.js";
import { validateUsageError } from "../utils.js";
import { Tree } from "../../shared-tree/index.js";

const schemaFactory = new SchemaFactory("Test");

describeHydration(
	"ObjectNode",
	(init) => {
		describe("shadowing", () => {
			it("constructor", () => {
				// constructor is a special case, since one is built in on the derived type.
				class Schema extends schemaFactory.object("x", {
					constructor: schemaFactory.number,
				}) {}

				const n = init(Schema, { constructor: 5 });

				const x = n.constructor;
				type check_ = requireAssignableTo<typeof x, number>;
				assert.equal(x, 5);
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

		describe("supports setting", () => {
			describe("primitives", () => {
				function check<const TNode>(
					schema: TreeNodeSchema<string, NodeKind, TNode>,
					before: TNode,
					after: TNode,
				) {
					describe(`required ${typeof before} `, () => {
						it(`(${pretty(before)} -> ${pretty(after)})`, () => {
							const Root = schemaFactory.object("", { value: schema });
							const root = init(Root, { value: before });
							assert.equal(root.value, before);
							root.value = after;
							assert.equal(root.value, after);
						});
					});

					describe(`optional ${typeof before}`, () => {
						it(`(undefined -> ${pretty(before)} -> ${pretty(after)})`, () => {
							const root = init(
								schemaFactory.object("", { value: schemaFactory.optional(schema) }),
								{ value: undefined },
							);
							assert.equal(root.value, undefined);
							root.value = before;
							assert.equal(root.value, before);
							root.value = after;
							assert.equal(root.value, after);
						});
					});
				}

				check(schemaFactory.boolean, false, true);
				check(schemaFactory.number, 0, 1);
				check(schemaFactory.string, "", "!");
			});

			describe("required object", () => {
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

			describe("optional object", () => {
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

			describe.skip("required list", () => {
				// const _ = new SchemaFactory("test");
				// const list = _.fieldNode("List<string>", _.sequence(_.string));
				// const parent = _.struct("parent", {
				// 	list,
				// });
				// const schema = _.intoSchema(parent);
				// const before: string[] = [];
				// const after = ["A"];
				// it(`(${pretty(before)} -> ${pretty(after)})`, () => {
				// 	const root = getRoot(schema, { list: before });
				// 	assert.deepEqual(root.list, before);
				// 	root.list = after;
				// 	assert.deepEqual(root.list, after);
				// });
			});

			describe.skip("optional list", () => {
				// const _ = new SchemaFactory("test");
				// const list = _.fieldNode("List<string>", _.sequence(_.string));
				// const parent = _.struct("parent", {
				// 	list: _.optional(list),
				// });
				// const schema = _.intoSchema(parent);
				// const before: string[] = [];
				// const after = ["A"];
				// it(`(undefined -> ${pretty(before)} -> ${pretty(after)})`, () => {
				// 	const root = getRoot(schema, { list: undefined });
				// 	assert.equal(root.list, undefined);
				// 	root.list = before;
				// 	assert.deepEqual(root.list, before);
				// 	root.list = after;
				// 	assert.deepEqual(root.list, after);
				// });
			});

			describe.skip("required map", () => {
				// TODO
			});

			describe.skip("optional map", () => {
				// TODO
			});
		});
	},
	() => {
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
	},
);
