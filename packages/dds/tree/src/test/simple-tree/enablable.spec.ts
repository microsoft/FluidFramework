/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert } from "node:assert";

import { SchemaFactoryAlpha } from "../../simple-tree/index.js";

const schemaFactory = new SchemaFactoryAlpha("Enablable");

describe("enablable", () => {
	describe("in objects", () => {
		class TestObject extends schemaFactory.objectAlpha("TestObject", {
			foo: [schemaFactory.number, schemaFactory.enablable(schemaFactory.string)],
			fo1: schemaFactory.optional(schemaFactory.string),
		}) {}
		
		it("can't be initialized", () => {
			// assert.throws(() => {
			const object = new TestObject({ foo: "test" });
			// });
		});
	});

	describe("in maps", () => {
		class TestMap extends schemaFactory.mapAlpha("TestMap", [
			schemaFactory.number,
			schemaFactory.enablable(schemaFactory.string),
		]) {}
	});

	describe("in arrays", () => {
		class TestArray extends schemaFactory.arrayAlpha("TestArray", [
			schemaFactory.number,
			schemaFactory.enablable(schemaFactory.string),
		]) {}
	});
});
