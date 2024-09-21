/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaFactory, type TreeNode } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { hydrate } from "../simple-tree/utils.js";
import {
	getPromptFriendlyTreeSchema,
	toDecoratedJson,
	// eslint-disable-next-line import/no-internal-modules
} from "../../agent-editing/promptGeneration.js";
// eslint-disable-next-line import/no-internal-modules
import { getResponse } from "../../agent-editing/llmClient.js";
// eslint-disable-next-line import/no-internal-modules
import { getJsonSchema } from "../../simple-tree/api/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { ResponseFormatJSONSchema } from "openai/resources/shared.mjs";
// eslint-disable-next-line import/no-internal-modules
import { objectIdKey } from "../../agent-editing/agentEditTypes.js";

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
	let idCount: { current: 0 };
	let idToNode: Map<number, TreeNode>;
	let nodeToId: Map<TreeNode, number>;
	beforeEach(() => {
		idCount = { current: 0 };
		idToNode = new Map<number, TreeNode>();
		nodeToId = new Map<TreeNode, number>();
	});
	it("adds ID fields", () => {
		const vector = new Vector({ x: 1, y: 2 });
		const hydratedObject = hydrate(Vector, vector);
		assert.equal(
			toDecoratedJson(idCount, idToNode, nodeToId, hydratedObject),
			JSON.stringify({
				[objectIdKey]: 0,
				x: 1,
				y: 2,
			}),
		);
	});

	it("handles nested objects", () => {
		const hydratedObject = hydrate(
			RootObject,
			new RootObject({ str: "hello", vectors: [{ x: 1, y: 2, z: 3 }], bools: [true] }),
		);
		assert.equal(
			toDecoratedJson(idCount, idToNode, nodeToId, hydratedObject),
			JSON.stringify({
				[objectIdKey]: 0,
				str: "hello",
				vectors: [
					{
						[objectIdKey]: 1,
						x: 1,
						y: 2,
						z: 3,
					},
				],
				bools: [true],
			}),
		);
		assert.equal(idToNode.get(0), hydratedObject);
		assert.equal(idToNode.get(1), hydratedObject.vectors.at(0));
	});

	it("handles non-POJO mode arrays", () => {
		const sf = new SchemaFactory("testSchema");
		class NamedArray extends sf.array("Vector", sf.number) {}
		class Root extends sf.object("Root", {
			arr: NamedArray,
		}) {}
		const hydratedObject = hydrate(Root, new Root({ arr: [1, 2, 3] }));
		assert.equal(
			toDecoratedJson(idCount, idToNode, nodeToId, hydratedObject),
			JSON.stringify({ __fluid_objectId: 0, arr: [1, 2, 3] }),
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

describe.skip("llmClient", () => {
	it("can accept a structured schema prompt", async () => {
		const userPrompt =
			"I need a catalog listing for a product. Please extract this info into the required schema. The product is a Red Ryder bicycle, which is a particularly fast bicycle, and which should be listed for one hundred dollars.";

		// const testSf = new SchemaFactory("test");
		// class CatalogEntry extends testSf.object("CatalogEntry", {
		// 	itemTitle: testSf.string,
		// 	itemDescription: testSf.string,
		// 	itemPrice: testSf.number,
		// }) {}

		// const jsonSchema = getJsonSchema(CatalogEntry);

		const responseSchema: ResponseFormatJSONSchema = {
			type: "json_schema",
			json_schema: {
				name: "Catalog_Entry",
				description: "An entry for an item in a product catalog",
				strict: true,
				schema: {
					"type": "object",
					"properties": {
						"title": {
							"type": "string",
							"description": "a title which must be in all caps",
						},
						"description": {
							"type": "string",
							"description": "the description of the item, which must be in CaMeLcAsE",
						},
						"price": {
							"type": "number",
							"description": "the price, which must be expressed with one decimal place.",
						},
					},
					"required": ["title", "description", "price"],
					"additionalProperties": false,
				},
			},
		};

		const response = await getResponse(userPrompt, responseSchema);

		console.log(response);
	});
});
