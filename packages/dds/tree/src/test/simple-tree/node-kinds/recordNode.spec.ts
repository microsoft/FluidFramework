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
const CustomizableNumberRecord = schemaFactory.record("Array", schemaFactory.number);

describe("RecordNode", () => {
	testRecordFromSchemaType("created in pojo-emulation mode", PojoEmulationNumberRecord);
	testRecordFromSchemaType("created in customizable mode", CustomizableNumberRecord);

	describeHydration("customizable", (init) => {
		// TODO: is this the right policy? Or should we allow when the type matches?
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
			// const _fromIterable: Schema = new Schema([]); // TODO?
		});

		it("create - NonClass", () => {
			const Schema = schemaFactory.record(schemaFactory.number);
			type Schema = NodeFromSchema<typeof Schema>;
			const _fromRecord: Schema = Schema.create({});
			// const _fromIterable: Schema = Schema.create([]); // TODO?
		});

		// it("constructor - recursive empty", () => {
		// 	class Schema extends schemaFactory.recordRecursive("x", [() => Schema]) {
		// 	}
		// 	const _fromIterable: Schema = new Schema({});
		// 	const _fromUndefined: Schema = new Schema(undefined);
		// 	const _fromNothing: Schema = new Schema();
		// });

		// describe("implicit construction", () => {
		// 	it("fromArray", () => {
		// 		class Schema extends schemaFactory.record("x", schemaFactory.number) {}
		// 		class Root extends schemaFactory.object("root", { data: Schema }) {}
		// 		const fromArray = new Root({ data: [5] });
		// 		assert.deepEqual([...fromArray.data], [5]);
		// 	});
		// 	it("fromMap", () => {
		// 		class Schema extends schemaFactory.record(
		// 			"x",
		// 			schemaFactory.record([schemaFactory.number, schemaFactory.string]),
		// 		) {}
		// 		class Root extends schemaFactory.object("root", { data: Schema }) {}

		// 		const data = [["x", 5]] as const;
		// 		const json = JSON.stringify(data);

		// 		const fromMap = new Root({ data: new Map(data) });
		// 		assert.equal(JSON.stringify(fromMap.data), json);
		// 	});
		// 	it("fromIterable", () => {
		// 		class Schema extends schemaFactory.record("x", schemaFactory.number) {}
		// 		class Root extends schemaFactory.object("root", { data: Schema }) {}
		// 		const fromArray = new Root({ data: [5] });
		// 		const fromIterable = new Root({ data: new Set([5]) });
		// 		assert.deepEqual([...fromIterable.data], [5]);
		// 	});
		// });

		it("nested", () => {
			class Schema extends schemaFactory.record(
				"x",
				schemaFactory.record("y", [schemaFactory.number, schemaFactory.string]),
			) {}
			const data = { a: { foo: 42, bar: "Hello world!" }, b: {} } as const;
			const json = JSON.stringify(data);
			const fromPOJO = new Schema(data);
			assert.equal(JSON.stringify(fromPOJO), json);
		});
	});
});

// // Workaround to avoid
// // `error TS2310: Type 'RecursiveArray' recursively references itself as a base type.` in the d.ts file.

// // Example workaround, see experimental/framework/tree-react-api/src/testExports.ts for an actual test of this including an import.
// declare const _RecursiveArrayWorkaround: FixRecursiveArraySchema<typeof RecursiveArray>;
// class RecursiveArray extends schemaFactory.recordRecursive("RA", [() => RecursiveArray]) {}
// {
// 	type _check = ValidateRecursiveSchema<typeof RecursiveArray>;
// }

// // Invalid case similar to ones generated in d.ts
// const Base = schemaFactory.recordRecursive("RA", [() => RecursiveArray2]);
// // @ts-expect-error Separated Base from schema errors.
// class RecursiveArray2 extends Base {}

// // Invalid case similar to ones generated in d.ts, with workaround:
// declare const _RecursiveArrayWorkaround3: FixRecursiveArraySchema<typeof RecursiveArray3>;
// const Base3 = schemaFactory.recordRecursive("RA", [() => RecursiveArray3]);
// class RecursiveArray3 extends Base3 {}
