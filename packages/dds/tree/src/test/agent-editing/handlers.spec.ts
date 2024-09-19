/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeViewConfiguration } from "../../simple-tree/api/index.js";
import { getView } from "../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { generateHandlers } from "../../agent-editing/handlers.js";
// eslint-disable-next-line import/no-internal-modules
import { createResponseHandler } from "../../json-handler/jsonHandler.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeEdit } from "../../agent-editing/agentEditTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { typeField } from "../../agent-editing/agentEditReducer.js";

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

describe("Agent Editing Handlers", () => {
	it("generates handlers", () => {
		const view = getView(new TreeViewConfiguration({ schema: RootObject }));
		const handler = generateHandlers(view, new Map());
		const jsonSchema = createResponseHandler(handler, new AbortController()).jsonSchema();
		debugger;
	});
});

describe("Stuff", () => {
	it("does stuff", async () => {
		const view = getView(new TreeViewConfiguration({ schema: RootObject }));
		view.initialize({
			// ID: 0?
			str: "TEST",
			vectors: [
				new Vector({ x: 1, y: 1, z: 1 }), // ID: 1?
				new Vector({ x: 2, y: 2 }), // ID: 2?
			],
			bools: [true],
		});

		const handler = generateHandlers(view, new Map());
		const edits = JSON.stringify(sampleEdits);
		const abortController = new AbortController();
		const responseHandler = createResponseHandler(handler, abortController);
		await responseHandler.processResponse(streamedLlmResponse(edits));

		debugger;

		assert.equal(view.root.vectors.length, 3);
		for (const vector of view.root.vectors) {
			assert.equal(vector.z, 0);
		}
	});
});

const streamedLlmResponse = (result: string) => {
	const chunkSize = 10;

	return {
		async *[Symbol.asyncIterator]() {
			for (let i = 0; i < result.length; i += chunkSize) {
				const chunk = result.slice(i, i + chunkSize);
				yield chunk;
			}
		},
	};
};

const sampleEdits: TreeEdit[] = [
	{
		type: "insert",
		content: { [typeField]: RootObject.identifier, x: 3, y: 3, z: 0 },
		destination: { objectId: 2, place: "after" },
	},
	{
		type: "modify",
		target: { objectId: 1 },
		field: "z",
		modification: 0,
	},
	{
		type: "modify",
		target: { objectId: 2 },
		field: "z",
		modification: 0,
	},
];
