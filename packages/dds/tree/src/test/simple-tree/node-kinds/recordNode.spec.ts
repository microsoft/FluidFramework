/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describeHydration } from "../utils.js";
import {
	SchemaFactoryAlpha,
	type ConciseTree,
	type NodeFromSchema,
	type NodeKind,
	type TreeLeafValue,
	type TreeNode,
	type TreeNodeSchema,
} from "../../../simple-tree/index.js";
import { validateUsageError } from "../../utils.js";
import { Tree, TreeAlpha } from "../../../shared-tree/index.js";

const schemaFactory = new SchemaFactoryAlpha("RecordNodeTest");
const PojoEmulationNumberRecord = schemaFactory.record(schemaFactory.number);
class CustomizableNumberRecord extends schemaFactory.record("Record", schemaFactory.number) {}

/**
 * Compares a tree with an expected "concise" tree representation.
 * Fails if they are not equivalent.
 */
function assertEqualTrees(actual: TreeNode, expected: ConciseTree): void {
	const actualVerbose = TreeAlpha.exportConcise(actual);
	assert.deepEqual(actualVerbose, expected);
}

describe.only("RecordNode", () => {
	{
		// Assignable to TypeScript record
		const _record1: Record<string, number> = PojoEmulationNumberRecord.create({});
		const _record2: Record<string, number> = new CustomizableNumberRecord({});
	}

	describe("construction", () => {
		it("constructor - empty", () => {
			class Schema extends schemaFactory.record("x", schemaFactory.number) {}
			const _fromRecord: Schema = new Schema({});
		});

		it("create - NonClass", () => {
			const Schema = schemaFactory.record(schemaFactory.number);
			type Schema = NodeFromSchema<typeof Schema>;
			const _fromRecord: Schema = Schema.create({});
		});

		describe("implicit construction", () => {
			it("named", () => {
				class Schema extends schemaFactory.record("x", schemaFactory.number) {}
				class Root extends schemaFactory.object("root", { data: Schema }) {}
				const fromPojo = new Root({ data: { foo: 42 } });
				assertEqualTrees(fromPojo.data, { foo: 42 });
			});

			it("structural", () => {
				class Root extends schemaFactory.object("root", {
					data: schemaFactory.record(schemaFactory.number),
				}) {}
				const fromPojo = new Root({ data: { foo: 42 } });
				assertEqualTrees(fromPojo.data, { foo: 42 });
			});
		});

		it("nested (named)", () => {
			class MyRecord extends schemaFactory.record(
				"x",
				schemaFactory.record("y", [schemaFactory.number, schemaFactory.string]),
			) {}
			const data = { a: { foo: 42, bar: "Hello world!" }, b: {} } as const;
			const json = JSON.stringify(data);
			const myRecord = new MyRecord(data);
			assert.equal(JSON.stringify(myRecord), json);
		});

		it("nested (structural)", () => {
			class MyRecord extends schemaFactory.record(
				"x",
				schemaFactory.record([schemaFactory.number, schemaFactory.string]),
			) {}
			const data = { a: { foo: 42, bar: "Hello world!" }, b: {} } as const;
			const json = JSON.stringify(data);
			const myRecord = new MyRecord(data);
			assert.equal(JSON.stringify(myRecord), json);
		});

		it("complex children", () => {
			class InnerObject extends schemaFactory.object("y", {
				foo: schemaFactory.number,
				bar: schemaFactory.string,
			}) {}
			class MyRecord extends schemaFactory.record("x", InnerObject) {}

			const myRecord = new MyRecord({
				a: { foo: 42, bar: "Hello world!" },
				b: { foo: 37, bar: "Everybody dance now!" },
			});

			delete myRecord.b;
			myRecord.a.foo = 100;

			myRecord.c = new InnerObject({ foo: 200, bar: "New entry!" });

			assert.equal(
				JSON.stringify(myRecord),
				JSON.stringify({
					a: { foo: 100, bar: "Hello world!" },
					c: { foo: 200, bar: "New entry!" },
				}),
			);
		});
	});

	describeHydration("POJO emulation", (init) => {
		it("deep equality", () => {
			const aInsertable = { foo: 42, bar: 100 };
			const aNode = PojoEmulationNumberRecord.create(aInsertable);
			assert.deepEqual(aNode, aNode);
			assert.deepEqual(aNode, aInsertable);

			// Structurally equivalent node
			const bNode = PojoEmulationNumberRecord.create(aInsertable);
			assert.deepEqual(bNode, aNode);

			// Structurally nonequivalent node
			const cNode = PojoEmulationNumberRecord.create({});
			assert.notDeepEqual(cNode, aNode);
			assert.notDeepEqual(cNode, aInsertable);

			// Structurally equivalent node with different schema
			const OtherSchema = schemaFactory.record(schemaFactory.number);
			const dNode = OtherSchema.create(aInsertable);
			assert.deepEqual(dNode, aNode);
		});
	});

	describeHydration("customizable", (init) => {
		it("deep equality", () => {
			const aInsertable = { foo: 42, bar: 100 };
			const aNode = new CustomizableNumberRecord(aInsertable);
			assert.deepEqual(aNode, aNode);
			assert.notDeepEqual(aNode, aInsertable);

			// Structurally equivalent node
			const bNode = new CustomizableNumberRecord(aInsertable);
			assert.deepEqual(bNode, aNode);
			assert.notDeepEqual(bNode, aInsertable);

			// Structurally nonequivalent node
			const cNode = new CustomizableNumberRecord({});
			assert.notDeepEqual(cNode, aNode);
			assert.notDeepEqual(cNode, aInsertable);

			// Structurally equivalent node with different schema
			class OtherSchema extends schemaFactory.record("other", schemaFactory.number) {}
			const dNode = new OtherSchema(aInsertable);
			assert.notDeepEqual(dNode, aNode);
		});

		describe("doesn't allow extra properties", () => {
			function assertConstructionFails<
				TInsertable,
				TSchema extends TreeNodeSchema<
					string,
					NodeKind,
					TreeNode | TreeLeafValue,
					TInsertable
				>,
			>(schema: TSchema, data: TInsertable): void {
				assert.throws(
					() => init(schema, data),
					validateUsageError(/[Ss]hadowing properties of record nodes is not permitted/),
				);
			}

			it("shadowed property with compatible type", () => {
				class Test extends schemaFactory.record("test", schemaFactory.number) {
					// Note: ideally this would not compile, but there isn't a way to prevent this for properties whose types are compatible with the schema's allowed types.
					public get foo(): number {
						return this.foo;
					}
				}
				assertConstructionFails(Test, { foo: 42 });
			});

			it("shadowed property with incompatible type", () => {
				class Test extends schemaFactory.record("test", schemaFactory.number) {
					// @ts-expect-error: Intentionally testing unsupported scenario.
					public get foo(): string {
						return this.foo;
					}
				}
				assertConstructionFails(Test, { foo: 42 });
			});

			it("shadowed built-in", () => {
				class Test extends schemaFactory.record("test", schemaFactory.string) {
					// @ts-expect-error: Intentionally testing unsupported scenario.
					public toString(): string {
						return "Hello world";
					}
				}
				assertConstructionFails(Test, { foo: "bar" });
			});
		});
	});

	// Tests which should behave the same for both "structurally named" "POJO emulation mode" records and "customizable" records can be added in this function to avoid duplication.
	function testRecordFromSchemaType(
		title: string,
		schemaType: typeof PojoEmulationNumberRecord | typeof CustomizableNumberRecord,
	): void {
		describeHydration(title, (init) => {
			it("can get and set values", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert.equal(record.foo, 1);
				assert.equal(record.bar, 2);
				assert.equal(record.baz, undefined);

				record.foo = 3;
				assert.equal(record.foo, 3);

				record.baz = 4;
				assert.equal(record.baz, 4);
			});

			it("can delete values", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert.equal(record.foo, 1);
				assert.equal(record.bar, 2);
				assert.equal(record.baz, undefined);

				delete record.bar;
				assert.equal(record.bar, undefined);

				delete record.baz; // Deleting a non-existent property should be a no-op
				assert.equal(record.baz, undefined);
			});

			it("cannot set values of wrong type", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert.throws(
					() => {
						// @ts-expect-error: Intentionally setting a string where a number is expected.
						record.foo = "strings are not allowed by the schema";
					},
					validateUsageError(
						/The provided data is incompatible with all of the types allowed by the schema/,
					),
				);
			});

			it("toString (not supported)", () => {
				const record = new CustomizableNumberRecord({ foo: 1, bar: 2 });
				assert.throws(
					// eslint-disable-next-line @typescript-eslint/no-base-to-string -- Explicitly testing this scenario
					() => record.toString(),
				);
			});

			it("String interpolation", () => {
				const input = { foo: 1, bar: 2, toString: 3 };
				const node = new CustomizableNumberRecord(input);
				/* eslint-disable @typescript-eslint/no-base-to-string -- Explicitly testing this scenario */
				assert.equal(`${node}`, "[object RecordNodeTest.Record]");
				assert.equal(String(node), "[object RecordNodeTest.Record]");
				assert.equal(Object.prototype.toString.call(node), "[object RecordNodeTest.Record]");
				/* eslint-enable @typescript-eslint/no-base-to-string */
			});

			it("JSON.stringify", () => {
				const tsRecord = { foo: 1, bar: 2, toJson: 3 };
				const recordNode = init(schemaType, tsRecord);
				assert.equal(JSON.stringify(recordNode), '{"foo":1,"bar":2,"toJson":3}');
			});

			it("Object.keys", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert.deepEqual(Object.keys(record), ["foo", "bar"]);
			});

			it("Object.values", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert.deepEqual(Object.values(record), [1, 2]);
			});

			it("Object.entries", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert.deepEqual(Object.entries(record), [
					["foo", 1],
					["bar", 2],
				]);
			});

			it("can check property existence using equals operator", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert(record.foo !== undefined);
				assert(record.bar !== undefined);
				assert(record.baz === undefined);
			});

			it("can check property existence using `in`", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert("foo" in record);
				assert("bar" in record);
				assert(!("baz" in record));
			});

			it("for...of", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });

				const output: [string, number][] = [];
				for (const entry of record) {
					output.push(entry);
				}

				assert.deepEqual(output, [
					["foo", 1],
					["bar", 2],
				]);
			});

			it("for...in", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });

				const output: string[] = [];
				// eslint-disable-next-line guard-for-in, no-restricted-syntax -- Explicitly testing this scenario
				for (const key in record) {
					output.push(key);
				}

				assert.deepEqual(output, ["foo", "bar"]);
			});

			it("spread into array", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				const spread = [...record];
				assert.deepEqual(spread, [
					["foo", 1],
					["bar", 2],
				]);
			});

			it("spread into object", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				const spread = { ...record };
				assert.deepEqual(spread, {
					foo: 1,
					bar: 2,
				});
			});
		});
	}

	testRecordFromSchemaType("created in pojo-emulation mode", PojoEmulationNumberRecord);
	testRecordFromSchemaType("created in customizable mode", CustomizableNumberRecord);

	describe("recursive", () => {
		class RecursiveRecordSchema extends schemaFactory.recordRecursive("RecursiveRecord", [
			schemaFactory.number,
			() => RecursiveRecordSchema,
		]) {}

		it("construction", () => {
			const _empty: RecursiveRecordSchema = new RecursiveRecordSchema({});
			const _nonEmpty: RecursiveRecordSchema = new RecursiveRecordSchema({
				foo: 42,
				bar: new RecursiveRecordSchema({ x: 100 }),
				baz: new RecursiveRecordSchema({}),
			});
		});

		it("can get and set values", () => {
			const record = new RecursiveRecordSchema({
				foo: 1,
				bar: new RecursiveRecordSchema({ x: 42 }),
			});
			assert.equal(record.foo, 1);
			assert(record.bar instanceof RecursiveRecordSchema);
			assert.equal(record.bar.x, 42);
			assert.equal(record.baz, undefined);

			record.foo = 3;
			assert.equal(record.foo, 3);

			record.bar.y = 37;
			assert.equal(record.bar.y, 37);

			record.bar = 37;
			assert.equal(record.bar, 37);

			record.baz = 4;
			assert.equal(record.baz, 4);
		});

		it("can delete values", () => {
			const record = new RecursiveRecordSchema({
				foo: 1,
				bar: new RecursiveRecordSchema({ x: 42 }),
			});
			assert.equal(record.foo, 1);
			assert(record.bar instanceof RecursiveRecordSchema);
			assert.equal(record.bar.x, 42);
			assert.equal(record.baz, undefined);

			delete record.bar;
			assert.equal(record.bar, undefined);

			delete record.baz; // Deleting a non-existent property should be a no-op
			assert.equal(record.baz, undefined);
		});

		it("cannot set values of wrong type", () => {
			const record = new RecursiveRecordSchema({
				foo: 1,
				bar: new RecursiveRecordSchema({ x: 42 }),
			});
			assert.throws(
				() => {
					// @ts-expect-error: Intentionally setting a value of an incompatible type.
					record.foo = "strings are not allowed by the schema";
				},
				validateUsageError(
					/The provided data is incompatible with all of the types allowed by the schema/,
				),
			);

			class OtherRecursiveRecord extends schemaFactory.recordRecursive("y", [
				schemaFactory.number,
				() => OtherRecursiveRecord,
			]) {}

			assert.throws(
				() => {
					// @ts-expect-error: Intentionally setting a value of an incompatible type.
					record.foo = new OtherRecursiveRecord({ x: 100 });
				},
				validateUsageError(/Invalid schema for this context/),
			);
		});

		it("toString (not supported)", () => {
			const node = new RecursiveRecordSchema({
				foo: 1,
				bar: new RecursiveRecordSchema({ x: 42 }),
			});
			assert.throws(
				// eslint-disable-next-line @typescript-eslint/no-base-to-string -- Explicitly testing this scenario
				() => node.toString(),
			);
		});

		it("String interpolation", () => {
			const node = new RecursiveRecordSchema({
				foo: 1,
				toString: new RecursiveRecordSchema({ x: 42 }),
			});
			/* eslint-disable @typescript-eslint/no-base-to-string -- Explicitly testing this scenario */
			assert.equal(`${node}`, "[object RecordNodeTest.RecursiveRecord]");
			assert.equal(String(node), "[object RecordNodeTest.RecursiveRecord]");
			assert.equal(
				Object.prototype.toString.call(node),
				"[object RecordNodeTest.RecursiveRecord]",
			);
			/* eslint-enable @typescript-eslint/no-base-to-string */
		});

		it("JSON.stringify", () => {
			const recordNode = new RecursiveRecordSchema({
				foo: 1,
				bar: new RecursiveRecordSchema({ x: 42 }),
			});
			assert.equal(JSON.stringify(recordNode), '{"foo":1,"bar":{"x":42}}');
		});

		it("Object.keys", () => {
			const record = new RecursiveRecordSchema({
				foo: 1,
				bar: new RecursiveRecordSchema({ x: 42 }),
			});
			assert.deepEqual(Object.keys(record), ["foo", "bar"]);
		});

		it("Object.values", () => {
			const bar = new RecursiveRecordSchema({ x: 42 });
			const record = new RecursiveRecordSchema({ foo: 1, bar });
			assert.deepEqual(Object.values(record), [1, bar]);
		});

		it("Object.entries", () => {
			const bar = new RecursiveRecordSchema({ x: 42 });
			const record = new RecursiveRecordSchema({ foo: 1, bar });
			assert.deepEqual(Object.entries(record), [
				["foo", 1],
				["bar", bar],
			]);
		});

		it("in", () => {
			const bar = new RecursiveRecordSchema({ x: 42 });
			const record = new RecursiveRecordSchema({ foo: 1, bar });
			assert("foo" in record);
			assert("bar" in record);
			assert(!("baz" in record));
			assert(Tree.is(record.bar, RecursiveRecordSchema));
			assert("x" in record.bar);
			assert(!("y" in record.bar));
		});

		it("for...of", () => {
			const bar = new RecursiveRecordSchema({ x: 42 });
			const record = new RecursiveRecordSchema({ foo: 1, bar });

			const output: [string, number | RecursiveRecordSchema][] = [];
			for (const entry of record) {
				output.push(entry);
			}

			assert.deepEqual(output, [
				["foo", 1],
				["bar", bar],
			]);
		});

		it("for...in", () => {
			const bar = new RecursiveRecordSchema({ x: 42 });
			const record = new RecursiveRecordSchema({ foo: 1, bar });

			const output: string[] = [];
			// eslint-disable-next-line guard-for-in, no-restricted-syntax -- Explicitly testing this scenario
			for (const key in record) {
				output.push(key);
			}

			assert.deepEqual(output, ["foo", "bar"]);
		});

		it("spread into array", () => {
			const bar = new RecursiveRecordSchema({ x: 42 });
			const record = new RecursiveRecordSchema({ foo: 1, bar });
			const spread = [...record];
			assert.deepEqual(spread, [
				["foo", 1],
				["bar", bar],
			]);
		});

		it("spread into object", () => {
			const bar = new RecursiveRecordSchema({ x: 42 });
			const record = new RecursiveRecordSchema({ foo: 1, bar });
			const spread = { ...record };
			assert.deepEqual(spread, {
				foo: 1,
				bar,
			});
		});
	});
});
