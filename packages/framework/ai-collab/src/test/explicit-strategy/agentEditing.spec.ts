/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SchemaFactory,
	getJsonSchema,
	SharedTree,
	TreeViewConfiguration,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

// eslint-disable-next-line import/no-internal-modules
import { objectIdKey } from "../../explicit-strategy/agentEditTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { IdGenerator } from "../../explicit-strategy/idGenerator.js";
import {
	getPromptFriendlyTreeSchema,
	toDecoratedJson,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/promptGeneration.js";

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

const factory = SharedTree.getFactory();

describe("toDecoratedJson", () => {
	let idGenerator: IdGenerator;
	beforeEach(() => {
		idGenerator = new IdGenerator();
	});

	it("adds ID fields", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: Vector }));
		view.initialize({ x: 1, y: 2 });

		assert.equal(
			toDecoratedJson(idGenerator, view.root),
			JSON.stringify({
				[objectIdKey]: "Vector1",
				x: 1,
				y: 2,
			}),
		);
	});

	it("handles nested objects", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: RootObject }));
		view.initialize({ str: "hello", vectors: [{ x: 1, y: 2, z: 3 }], bools: [true] });

		assert.equal(
			toDecoratedJson(idGenerator, view.root),
			JSON.stringify({
				[objectIdKey]: "RootObject1",
				str: "hello",
				vectors: [
					{
						[objectIdKey]: "Vector1",
						x: 1,
						y: 2,
						z: 3,
					},
				],
				bools: [true],
			}),
		);

		assert.equal(idGenerator.getNode("RootObject1"), view.root);
		assert.equal(idGenerator.getNode("Vector1"), view.root.vectors.at(0));
	});

	it("handles non-POJO mode arrays", () => {
		const sf = new SchemaFactory("testSchema");
		class NamedArray extends sf.array("Vector", sf.number) {}
		class Root extends sf.object("Root", {
			arr: NamedArray,
		}) {}

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: Root }));
		view.initialize({ arr: [1, 2, 3] });

		assert.equal(
			toDecoratedJson(idGenerator, view.root),
			JSON.stringify({ [objectIdKey]: "Root1", arr: [1, 2, 3] }),
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
