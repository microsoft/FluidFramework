/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describeHydration } from "../utils.js";
import { SchemaFactoryAlpha, type NodeFromSchema } from "../../../simple-tree/index.js";
import { validateUsageError } from "../../utils.js";

const schemaFactory = new SchemaFactoryAlpha("RecordNodeTest");
const PojoEmulationNumberRecord = schemaFactory.record(schemaFactory.number);
const CustomizableNumberRecord = schemaFactory.record("Record", schemaFactory.number);

describe.only("RecordNode", () => {
	testRecordFromSchemaType("created in pojo-emulation mode", PojoEmulationNumberRecord);
	testRecordFromSchemaType("created in customizable mode", CustomizableNumberRecord);

	describeHydration("customizable", (init) => {
		it("doesn't allow extra properties", () => {
			class Test extends schemaFactory.record("test", schemaFactory.number) {
				public get foo(): number {
					return this.foo;
				}
			}

			assert.throws(
				() => init(Test, { bar: 1, baz: 2 }),
				validateUsageError(/[Ss]hadowing properties of record nodes is not permitted/),
			);
		});
	});

	// Tests which should behave the same for both "structurally named" "POJO emulation mode" records and "customizable" records can be added in this function to avoid duplication.
	function testRecordFromSchemaType(
		title: string,
		schemaType: typeof PojoEmulationNumberRecord | typeof CustomizableNumberRecord,
	): void {
		describeHydration(title, (init) => {
			it("stringifies in the same way as a POJO record", () => {
				const tsRecord = { foo: 1, bar: 2 };
				const recordNode = init(schemaType, tsRecord);
				assert.equal(JSON.stringify(recordNode), JSON.stringify(tsRecord));
			});

			it("can get and set values", () => {
				const record = init(schemaType, { foo: 1, bar: 2 });
				assert.equal(record.foo, 1);
				assert.equal(record.bar, 2);
				assert.equal(record.baz, undefined);

				record.foo = 3;
				assert.equal(record.foo, 3);

				record.baz = 4;
				assert.equal(record.baz, 4);

				delete record.bar;
				assert.equal(record.bar, undefined);
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
		});
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
				assert.deepEqual(fromPojo.data, { foo: 42 });
			});

			it("structural", () => {
				class Root extends schemaFactory.object("root", {
					data: schemaFactory.record(schemaFactory.number),
				}) {}
				const fromPojo = new Root({ data: { foo: 42 } });
				assert.deepEqual(fromPojo.data, { foo: 42 });
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

	describe("recursive", () => {
		class RecursiveRecordSchema extends schemaFactory.recordRecursive("x", [
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

		it("stringifies in the same way as a POJO record", () => {
			const tsRecord = { foo: 1, bar: 2 };
			const recordNode = new RecursiveRecordSchema(tsRecord);
			assert.equal(JSON.stringify(recordNode), JSON.stringify(tsRecord));
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

			delete record.bar;
			assert.equal(record.bar, undefined);
		});

		it("cannot set values of wrong type", () => {
			const record = new RecursiveRecordSchema({
				foo: 1,
				bar: new RecursiveRecordSchema({ x: 42 }),
			});
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
			assert.deepEqual(Object.values(record), [1, bar]); // TODO
		});

		it("Object.entries", () => {
			const bar = new RecursiveRecordSchema({ x: 42 });
			const record = new RecursiveRecordSchema({ foo: 1, bar });
			assert.deepEqual(Object.entries(record), [
				// TODO
				["foo", 1],
				["bar", bar],
			]);
		});
	});
});
