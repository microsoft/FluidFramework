/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactoryAlpha } from "../../simple-tree/index.js";

const schemaFactory = new SchemaFactoryAlpha("Enablable");

describe("enablable", () => {
	describe("in objects", () => {
		class TestObject extends schemaFactory.objectAlpha("TestObject", {
			foo: [schemaFactory.number, schemaFactory.enablable(schemaFactory.string)],
			fo1: schemaFactory.optional(schemaFactory.string),
		}) {}

		it("can't be initialized", () => {
			assert.throws(() => {
				const _ = new TestObject({ foo: "test" });
			});
		});

		it("can't be set", () => {
			const testObject = new TestObject({ foo: 3 });
			assert.throws(() => {
				testObject.foo = "test";
			});
		});
	});

	describe("in maps", () => {
		class TestMap extends schemaFactory.mapAlpha("TestMap", [
			schemaFactory.number,
			schemaFactory.enablable(schemaFactory.string),
		]) {}

		it("can't be initialized", () => {
			assert.throws(() => {
				const _ = new TestMap({ foo: "test" });
			});
		});

		it("can't be set", () => {
			const testMap = new TestMap({ foo: 3 });
			assert.throws(() => {
				testMap.set("foo", "test");
			});
		});
	});

	describe("in arrays", () => {
		class TestArray extends schemaFactory.arrayAlpha("TestArray", [
			schemaFactory.number,
			schemaFactory.enablable(schemaFactory.string),
		]) {}

		it("can't be initialized", () => {
			assert.throws(() => {
				const _ = new TestArray(["test"]);
			});
		});

		it("can't be set", () => {
			const testArray = new TestArray([3]);
			assert.throws(() => {
				testArray.insertAtEnd("test");
			});
		});
	});

	it("can be permitted by mapTreeFromNodeData", () => {
		class TestObject extends schemaFactory.objectAlpha("TestObject", {
			foo: [schemaFactory.number, schemaFactory.enablable(schemaFactory.string)],
			fo1: schemaFactory.optional(schemaFactory.string),
		}) {}

		it("");
	});
});
