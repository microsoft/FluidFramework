/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { hydrate } from "../simple-tree/utils.js";
import {
	getPromptFriendlyTreeSchema,
	toDecoratedJson,
	// eslint-disable-next-line import/no-internal-modules
} from "../../agent-editing/promptGeneration.js";
// eslint-disable-next-line import/no-internal-modules
import { getJsonSchema } from "../../simple-tree/api/index.js";

const demoSf = new SchemaFactory("agentSchema");

class Vector extends demoSf.object("Vector", {
	x: demoSf.number,
	y: demoSf.number,
	z: demoSf.optional(demoSf.number),
}) {}

class RootObject extends demoSf.object("RootObject", {
	str: demoSf.string,
	vectors: demoSf.array(Vector),
	bools: demoSf.array(demoSf.boolean),
}) {}

describe("toDecoratedJson", () => {
	it("adds ID fields", () => {
		const vector = new Vector({ x: 1, y: 2 });
		const hydratedObject = hydrate(Vector, vector);
		assert.equal(
			toDecoratedJson(hydratedObject).stringified,
			JSON.stringify({
				__fluid_id: 0,
				x: 1,
				y: 2,
			}),
		);
	});
});

describe("Makes TS type strings from schema", () => {
	it("for objects with primitive fields", () => {
		const testSf = new SchemaFactory("test");
		class Foo extends testSf.object("Foo", {
			x: testSf.number,
			y: testSf.string,
			z: testSf.optional(testSf.null),
		}) {}
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(Foo)),
			"interface Foo { x: number; y: string; z: null | undefined; }",
		);
	});

	// This test fails due to the fact that identifier fields are incorrectly set as optional in the JSON Schema
	it.skip("for objects with identifier fields", () => {
		const testSf = new SchemaFactory("test");
		class Foo extends testSf.object("Foo", {
			y: testSf.identifier,
		}) {}
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(Foo)),
			"interface Foo { y: string; }",
		);
	});

	it("for objects with polymorphic fields", () => {
		const testSf = new SchemaFactory("test");
		class Bar extends testSf.object("Bar", {
			z: testSf.number,
		}) {}
		class Foo extends testSf.object("Foo", {
			y: demoSf.required([demoSf.number, demoSf.string, Bar]),
		}) {}
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(Foo)),
			"interface Foo { y: number | string | Bar; } interface Bar { z: number; }",
		);
	});

	it("for objects with array fields", () => {
		const testSf = new SchemaFactory("test");
		class Foo extends testSf.object("Foo", {
			y: demoSf.array(demoSf.number),
		}) {}
		const stringified = JSON.stringify(getJsonSchema(Foo));
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(Foo)),
			"interface Foo { y: number[]; }",
		);
	});

	it("for objects with nested array fields", () => {
		const testSf = new SchemaFactory("test");
		class Foo extends testSf.object("Foo", {
			y: demoSf.array([
				demoSf.number,
				demoSf.array([demoSf.number, demoSf.array(demoSf.string)]),
			]),
		}) {}
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(Foo)),
			"interface Foo { y: (number | (number | string[])[])[]; }",
		);
	});

	it("for objects in the demo schema", () => {
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(RootObject)),
			"interface RootObject { str: string; vectors: Vector[]; bools: boolean[]; } interface Vector { x: number; y: number; z: number | undefined; }",
		);
	});
});
