/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { TreeNodeSchema } from "@fluidframework/tree";
import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";

import {
	getFriendlyName,
	unqualifySchema,
	findSchemas,
	isNamedSchema,
	IdentifierCollisionResolver,
} from "../utils.js";

const sf = new SchemaFactoryAlpha("test.scope");
class TestObject extends sf.object("TestObject", { value: sf.string }) {}
class NamedStringArray extends sf.array("NamedStringArray", sf.string) {}
class NamedStringMap extends sf.map("NamedStringMap", sf.string) {}
class NamedStringRecord extends sf.record("NamedStringRecord", sf.string) {}

// Schema objects with invalid typescript type characters.
class InvalidCharacters extends sf.object("Test-Object!", { value: sf.string }) {}
class LeadingDigit extends sf.object("1TestObject", { value: sf.string }) {}

/**
 * Creates a named object schema with the given scope and name.
 * The resulting schema has identifier `"${scope}.${name}"`.
 */
function createSchema(scope: string, name: string): TreeNodeSchema {
	return new SchemaFactoryAlpha(scope).object(name, {});
}

function resolveAll(schemas: TreeNodeSchema[]): string[] {
	const resolver = new IdentifierCollisionResolver();
	return schemas.map((s) => resolver.resolve(s));
}

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

		// Object with invalid characters
		const ArrayOfObjectsWithInvalidCharacters = sf.array(InvalidCharacters);
		assert.equal(getFriendlyName(ArrayOfObjectsWithInvalidCharacters), "Test_Object_[]");
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

		// Object with invalid characters

		const InnerMap2 = sf.map(InvalidCharacters);
		const InnerRecord2 = sf.record(InnerMap2);
		const InnerArray2 = sf.array(InnerRecord2);
		const OuterMap2 = sf.map(InnerArray2);
		assert.equal(
			getFriendlyName(OuterMap2),
			"Map<string, Record<string, Map<string, Test_Object_>>[]>",
		);
	});

	it("sanitizes invalid characters to underscores.", () => {
		assert.equal(getFriendlyName(InvalidCharacters), "Test_Object_");
	});

	it("prefixes an underscore when the name starts with an invalid character", () => {
		assert.equal(getFriendlyName(LeadingDigit), "_1TestObject");
	});
});

describe("unqualifySchema", () => {
	it("strips the scope from a qualified name", () => {
		assert.equal(unqualifySchema(TestObject.identifier), "TestObject");
	});

	it("returns the original name when no scope is present", () => {
		assert.equal(unqualifySchema("NoScopeName"), "NoScopeName");
	});

	it("sanitizes invalid characters to underscores.", () => {
		// With strings
		assert.equal(unqualifySchema("Test-Object"), "Test_Object");
		assert.equal(unqualifySchema("Test Object"), "Test_Object");

		// With schema identifiers from schemafactory,
		assert.equal(unqualifySchema(InvalidCharacters.identifier), "Test_Object_");
	});

	it("prefixes an underscore when the name starts with an invalid character", () => {
		// With strings
		assert.equal(unqualifySchema("1TestObject"), "_1TestObject");
		assert.equal(unqualifySchema("-TestObject"), "_TestObject");

		// With schema identifiers from schemafactory,
		assert.equal(unqualifySchema(LeadingDigit.identifier), "_1TestObject");
	});

	it("returns stable names for valid identifiers", () => {
		assert.equal(unqualifySchema("TestObject"), "TestObject");
		assert.equal(unqualifySchema("com.fluidframework.TestObject"), "TestObject");
		assert.equal(unqualifySchema("ABC123_$"), "ABC123_$");
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
		for (const s of findSchemas(Root, (schema) => isNamedSchema(schema.identifier))) {
			identifiers.push((s as { identifier: string }).identifier);
		}
		assert.equal(identifiers.length, new Set(identifiers).size);
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

describe("IdentifierCollisionResolver", () => {
	it("returns array with same length as input", () => {
		const input = [
			createSchema("scope1", "Foo"),
			createSchema("scope1", "Bar"),
			createSchema("scope1", "Baz"),
		];
		const result = resolveAll(input);
		assert.equal(result.length, input.length);
	});

	it("preserves non-colliding names", () => {
		const input = [
			createSchema("scope1", "Foo"),
			createSchema("scope1", "Bar"),
			createSchema("scope1", "Baz"),
		];
		const result = resolveAll(input);
		assert.deepEqual(result, ["Foo", "Bar", "Baz"]);
	});

	it("resolves three-way collisions: first keeps original, rest get suffixes", () => {
		const input = [
			createSchema("scope1", "Foo"),
			createSchema("scope2", "Foo"),
			createSchema("scope3", "Foo"),
		];
		const result = resolveAll(input);
		assert.equal(result[0], "Foo");
		assert.equal(result[1], "Foo_2");
		assert.equal(result[2], "Foo_3");
	});

	it("handles mixed colliding and non-colliding names", () => {
		const input = [
			createSchema("scope1", "Foo"),
			createSchema("scope2", "Foo"),
			createSchema("scope1", "Bar"),
		];
		const result = resolveAll(input);
		assert.equal(result[0], "Foo");
		assert.equal(result[1], "Foo_2");
		assert.equal(result[2], "Bar");
	});

	it("handles suffix collisions with later natural names", () => {
		const input = [
			createSchema("scope1", "Foo"),
			createSchema("scope2", "Foo"),
			createSchema("scope3", "Foo_2"),
		];
		const result = resolveAll(input);
		assert.equal(result[0], "Foo");
		assert.equal(result[1], "Foo_2");
		assert.equal(result[2], "Foo_2_2");
	});

	it("identical full identifiers map to the same friendly name", () => {
		const schema = createSchema("scope", "Foo");
		const result = resolveAll([schema, schema]);
		assert.equal(result[0], "Foo");
		assert.equal(result[1], "Foo");
	});

	it("multi-level scope collisions: first keeps original, rest get suffixes", () => {
		const input = [
			createSchema("outer1.inner1", "Foo"),
			createSchema("outer2.inner1", "Foo"),
			createSchema("outer1.inner2", "Foo"),
			createSchema("outer2.inner2", "Foo"),
			createSchema("outer1.inner1", "Bar"),
			createSchema("outer2.inner1", "Bar"),
			createSchema("outer1.inner2", "Bar"),
			createSchema("outer2.inner2", "Bar"),
		];
		const result = resolveAll(input);
		assert.equal(result[0], "Foo");
		assert.equal(result[1], "Foo_2");
		assert.equal(result[2], "Foo_3");
		assert.equal(result[3], "Foo_4");
		assert.equal(result[4], "Bar");
		assert.equal(result[5], "Bar_2");
		assert.equal(result[6], "Bar_3");
		assert.equal(result[7], "Bar_4");
	});

	it("handles unnamed (inline) schemas", () => {
		const unnamedArray = sf.array(sf.string);
		const unnamedMap = sf.map(sf.string);
		const unnamedRecord = sf.record(sf.string);
		const nestedArrayOfMaps = sf.array(sf.map(TestObject));
		const nestedMapOfRecords = sf.map(sf.record(sf.number));
		const nestedRecordOfArrays = sf.record(sf.array(sf.string));
		const result = resolveAll([
			unnamedArray,
			unnamedMap,
			unnamedRecord,
			nestedArrayOfMaps,
			nestedMapOfRecords,
			nestedRecordOfArrays,
		]);
		assert.equal(result[0], "string[]");
		assert.equal(result[1], "Map<string, string>");
		assert.equal(result[2], "Record<string, string>");
		assert.equal(result[3], "Map<string, TestObject>[]");
		assert.equal(result[4], "Map<string, Record<string, number>>");
		assert.equal(result[5], "Record<string, string[]>");
	});
});
