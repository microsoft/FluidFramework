/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-array-callback-reference */

import { strict as assert } from "node:assert";

import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";

import {
	getFriendlyName,
	unqualifySchema,
	findNamedSchemas,
	isNamedSchema,
} from "../utils.js";

const sf = new SchemaFactoryAlpha("test.scope");
class TestObject extends sf.object("TestObject", { value: sf.string }) {}
class NamedStringArray extends sf.array("NamedStringArray", sf.string) {}
class NamedStringMap extends sf.map("NamedStringMap", sf.string) {}
class NamedStringRecord extends sf.record("NamedStringRecord", sf.string) {}

describe("getFriendlyName", () => {
	it("returns the name for a named object schema", () => {
		assert.equal(getFriendlyName(TestObject), "TestObject");
	});

	it("returns the name for a named array schema", () => {
		assert.equal(getFriendlyName(NamedStringArray), "NamedStringArray");
	});

	it("returns the name for a named map schema", () => {
		assert.equal(getFriendlyName(NamedStringMap), "NamedStringMap");
	});

	it("returns the name for a named record schema", () => {
		assert.equal(getFriendlyName(NamedStringRecord), "NamedStringRecord");
	});

	it("handles inline array schemas", () => {
		const InlineArray = sf.array(sf.string);
		assert.equal(getFriendlyName(InlineArray), "string[]");
	});

	it("handles inline map schemas", () => {
		const InlineMap = sf.map(sf.string);
		assert.equal(getFriendlyName(InlineMap), "Map<string, string>");
	});

	it("handles inline record schemas", () => {
		const InlineRecord = sf.record(sf.string);
		assert.equal(getFriendlyName(InlineRecord), "Record<string, string>");
	});

	it("handles arrays of object schemas", () => {
		const ArrayOfObjects = sf.array(TestObject);
		assert.equal(getFriendlyName(ArrayOfObjects), "TestObject[]");
	});

	it("handles maps of array schemas", () => {
		const ArrayOfString = sf.array(sf.string);
		const MapOfArrays = sf.map(ArrayOfString);
		assert.equal(getFriendlyName(MapOfArrays), "Map<string, string[]>");
	});

	it("handles arrays of map schemas", () => {
		const MapOfString = sf.map(sf.string);
		const ArrayOfMaps = sf.array(MapOfString);
		assert.equal(getFriendlyName(ArrayOfMaps), "Map<string, string>[]");
	});

	it("handles records of array schemas", () => {
		const ArrayOfString = sf.array(sf.string);
		const RecordOfArrays = sf.record(ArrayOfString);
		assert.equal(getFriendlyName(RecordOfArrays), "Record<string, string[]>");
	});

	it("handles nested arrays of arrays schemas", () => {
		const Inner = sf.array(sf.string);
		const Outer = sf.array(Inner);
		assert.equal(getFriendlyName(Outer), "string[][]");
	});

	it("handles arrays of record schemas", () => {
		const InnerRecord = sf.record(sf.string);
		const ArrayOfRecords = sf.array(InnerRecord);
		assert.equal(getFriendlyName(ArrayOfRecords), "Record<string, string>[]");
	});

	it("handles maps of map schemas", () => {
		const InnerMap = sf.map(sf.string);
		const MapOfMaps = sf.map(InnerMap);
		assert.equal(getFriendlyName(MapOfMaps), "Map<string, Map<string, string>>");
	});

	it("handles maps of record schemas", () => {
		const InnerRecord = sf.record(sf.string);
		const MapOfRecords = sf.map(InnerRecord);
		assert.equal(getFriendlyName(MapOfRecords), "Map<string, Record<string, string>>");
	});

	it("handles records of map schemas", () => {
		const InnerMap = sf.map(sf.string);
		const RecordOfMaps = sf.record(InnerMap);
		assert.equal(getFriendlyName(RecordOfMaps), "Record<string, Map<string, string>>");
	});

	it("handles records of record schemas", () => {
		const InnerRecord = sf.record(sf.string);
		const RecordOfRecords = sf.record(InnerRecord);
		assert.equal(getFriendlyName(RecordOfRecords), "Record<string, Record<string, string>>");
	});

	it("handles maps of object schemas", () => {
		const MapOfObjects = sf.map(TestObject);
		assert.equal(getFriendlyName(MapOfObjects), "Map<string, TestObject>");
	});

	it("handles records of object schemas", () => {
		const RecordOfObjects = sf.record(TestObject);
		assert.equal(getFriendlyName(RecordOfObjects), "Record<string, TestObject>");
	});

	it("handles type unions", () => {
		const ArrayOfUnion = sf.array([sf.string, sf.number, TestObject]);
		assert.equal(getFriendlyName(ArrayOfUnion), "(string | number | TestObject)[]");
		const MapOfUnion = sf.map([sf.string, sf.number, TestObject]);
		assert.equal(getFriendlyName(MapOfUnion), "Map<string, (string | number | TestObject)>");
		const RecordOfUnion = sf.record([sf.string, sf.number, TestObject]);
		assert.equal(
			getFriendlyName(RecordOfUnion),
			"Record<string, (string | number | TestObject)>",
		);
	});

	it("handles deep nesting", () => {
		const InnerMap = sf.map(TestObject);
		const InnerRecord = sf.record(InnerMap);
		const InnerArray = sf.array(InnerRecord);
		const OuterMap = sf.map(InnerArray);
		assert.equal(
			getFriendlyName(OuterMap),
			"Map<string, Record<string, Map<string, TestObject>>[]>",
		);
	});
});

describe("unqualifySchema", () => {
	it("strips the scope from a qualified name", () => {
		assert.equal(unqualifySchema(TestObject.identifier), "TestObject");
	});

	it("returns the original name when no scope is present", () => {
		assert.equal(unqualifySchema("NoScopeName"), "NoScopeName");
	});
});

describe("isNamedSchema", () => {
	it("returns true for named object schema", () => {
		assert.equal(isNamedSchema(TestObject.identifier), true);
	});

	it("returns true for named array schema", () => {
		assert.equal(isNamedSchema(NamedStringArray.identifier), true);
	});

	it("returns true for named map schema", () => {
		assert.equal(isNamedSchema(NamedStringMap.identifier), true);
	});

	it("returns true for named record schema", () => {
		assert.equal(isNamedSchema(NamedStringRecord.identifier), true);
	});

	it("returns false for primitive schema identifiers", () => {
		assert.equal(isNamedSchema("com.fluidframework.leaf.string"), false);
		assert.equal(isNamedSchema("string"), false);
		assert.equal(isNamedSchema("com.fluidframework.leaf.number"), false);
		assert.equal(isNamedSchema("number"), false);
		assert.equal(isNamedSchema("com.fluidframework.leaf.boolean"), false);
		assert.equal(isNamedSchema("boolean"), false);
		assert.equal(isNamedSchema("com.fluidframework.leaf.null"), false);
		assert.equal(isNamedSchema("null"), false);
		assert.equal(isNamedSchema("com.fluidframework.leaf.handle"), false);
		assert.equal(isNamedSchema("handle"), false);
	});

	it("returns false for inline array/map/record schemas", () => {
		const InlineArray = sf.array(sf.string);
		const InlineMap = sf.map(sf.string);
		const InlineRecord = sf.record(sf.string);
		assert.equal(isNamedSchema(InlineArray.identifier), false);
		assert.equal(isNamedSchema(InlineMap.identifier), false);
		assert.equal(isNamedSchema(InlineRecord.identifier), false);
	});
});

describe("findNamedSchemas", () => {
	it("yields only the existing named schemas transitively (excluding inline and primitives)", () => {
		// Inline container schemas should not be included
		const InlineArray = sf.array(sf.string);
		const InlineMap = sf.map(sf.string);
		const InlineRecord = sf.record(sf.string);
		class Root extends sf.object("Root", {
			object: TestObject,
			array: NamedStringArray,
			map: NamedStringMap,
			record: NamedStringRecord,
			inlineArr: InlineArray,
			inlineMap: InlineMap,
			inlineRec: InlineRecord,
			nested: sf.array(NamedStringMap), // Test deeply nested named schema
			primitive: sf.string,
		}) {}

		const identifiers: string[] = [];
		for (const s of findNamedSchemas(Root)) {
			identifiers.push((s as { identifier: string }).identifier);
		}
		assert.equal(identifiers.length, new Set(identifiers).size + 1); // There is one duplicate schema that is used twice (NamedStringMap)
		for (const s of [Root, TestObject, NamedStringArray, NamedStringMap, NamedStringRecord]) {
			assert.ok(identifiers.includes(s.identifier), `Expected named schema ${s.identifier}`);
		}
		for (const s of [InlineArray, InlineMap, InlineRecord]) {
			assert.ok(
				!identifiers.includes(s.identifier),
				`Inline schema ${s.identifier} should not be yielded`,
			);
		}
		assert.ok(!identifiers.includes("string"));
		assert.ok(!identifiers.includes("number"));
	});
});

/* eslint-enable unicorn/no-array-callback-reference */
