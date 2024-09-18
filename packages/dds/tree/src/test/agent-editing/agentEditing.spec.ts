/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { hydrate } from "../simple-tree/utils.js";
import { getPromptFriendlyTreeSchema, toDecoratedJson } from "../../agent-editing/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getJsonSchema } from "../../simple-tree/api/index.js";

const sf = new SchemaFactory("agentSchema");

class Vector extends sf.object("Vector", {
	id: sf.identifier, // will be omitted from the generated JSON schema
	x: sf.number,
	y: sf.number,
	z: sf.optional(sf.number),
}) {}

class RootObject extends sf.object("RootObject", {
	str: sf.string,
	vectors: sf.array(Vector),
	bools: sf.array(sf.boolean),
}) {}

const config = new TreeViewConfiguration({ schema: [sf.number, RootObject] });

describe("toDecoratedJson", () => {
	it("adds ID fields", () => {
		const vector = new Vector({ id: "1", x: 1, y: 2 });
		const hydratedObject = hydrate(Vector, vector);
		assert.equal(
			toDecoratedJson(hydratedObject).stringified,
			JSON.stringify({
				__fluid_id: 0,
				id: "1",
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
		}) {}
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(Foo)),
			"interface Foo { x: number; y: string; }",
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
			y: sf.required([sf.number, sf.string, Bar]),
		}) {}
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(Foo)),
			"interface Foo { y: number | string | Bar; } interface Bar { z: number; }",
		);
	});

	it("for objects with array fields", () => {
		const testSf = new SchemaFactory("test");
		class Foo extends testSf.object("Foo", {
			y: sf.array(sf.number),
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
			y: sf.array([sf.number, sf.array([sf.number, sf.array(sf.string)])]),
		}) {}
		assert.equal(
			getPromptFriendlyTreeSchema(getJsonSchema(Foo)),
			"interface Foo { y: (number | (number | string[])[])[]; }",
		);
	});
});
