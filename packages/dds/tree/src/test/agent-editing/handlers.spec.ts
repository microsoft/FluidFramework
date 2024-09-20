// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import { strict as assert } from "assert";
// import { SchemaFactory } from "../../simple-tree/index.js";
// // eslint-disable-next-line import/no-internal-modules
// import { TreeViewConfiguration } from "../../simple-tree/api/index.js";
// import { getView } from "../utils.js";
// // eslint-disable-next-line import/no-internal-modules
// import { generateHandlers } from "../../agent-editing/handlers.js";
// // eslint-disable-next-line import/no-internal-modules
// import { createResponseHandler } from "../../json-handler/jsonHandler.js";
// // eslint-disable-next-line import/no-internal-modules
// import { objectIdKey, type TreeEdit } from "../../agent-editing/agentEditTypes.js";
// // eslint-disable-next-line import/no-internal-modules
// import { typeField } from "../../agent-editing/agentEditReducer.js";
// // eslint-disable-next-line import/no-internal-modules
// import { toDecoratedJson } from "../../agent-editing/promptGeneration.js";
// import { generateTreeEdits } from "../../agent-editing/index.js";

// const sf = new SchemaFactory("agentSchema");

// class Vector extends sf.object("Vector", {
// 	id: sf.identifier,
// 	x: sf.required(sf.number, { metadata: { description: "The x-coordinate of the vector." } }),
// 	y: sf.required(sf.number, { metadata: { description: "The y-coordinate of the vector." } }),
// 	z: sf.optional(sf.number, {
// 		metadata: {
// 			description:
// 				"The optional z-coordinate of the vector. If absent, this is a 2D vector. If present, it is a 3D vector.",
// 		},
// 	}),
// 	timeCreated: sf.required(sf.string, {
// 		metadata: { llmDefault: () => "Taylor's underpants are inside out" },
// 	}),
// }) {}

// class RootObject extends sf.object("RootObject", {
// 	str: sf.string,
// 	vectors: sf.array(Vector),
// 	bools: sf.array(sf.boolean),
// }) {}

// describe("Agent Editing Handlers", () => {
// 	it("generates handlers", () => {
// 		const view = getView(new TreeViewConfiguration({ schema: RootObject }));
// 		const handler = generateHandlers(view, new Map());
// 		const jsonSchema = createResponseHandler(handler, new AbortController()).jsonSchema();
// 		debugger;
// 	});
// });

// describe.skip("Stuff", () => {
// 	it("does stuff", async () => {
// 		const view = getView(new TreeViewConfiguration({ schema: RootObject }));
// 		view.initialize({
// 			// ID: 0?
// 			str: "TEST",
// 			vectors: [
// 				new Vector({ x: 1, y: 1, z: 1, timeCreated: Date.now().toString() }), // ID: 1?
// 				new Vector({ x: 2, y: 2, timeCreated: Date.now().toString() }), // ID: 2?
// 			],
// 			bools: [true],
// 		});

// 		const handler = generateHandlers(view, toDecoratedJson(view.root).idMap);
// 		const edits = JSON.stringify(sampleEdits);
// 		const abortController = new AbortController();
// 		const responseHandler = createResponseHandler(handler, abortController);
// 		await responseHandler.processResponse(streamedLlmResponse(edits));

// 		debugger;

// 		assert.equal(view.root.vectors.length, 3);
// 		for (const vector of view.root.vectors) {
// 			assert.equal(vector.z, 0);
// 		}
// 	});
// });

// const streamedLlmResponse = (result: string) => {
// 	const chunkSize = 10;

// 	return {
// 		async *[Symbol.asyncIterator]() {
// 			for (let i = 0; i < result.length; i += chunkSize) {
// 				const chunk = result.slice(i, i + chunkSize);
// 				yield chunk;
// 			}
// 		},
// 	};
// };

// const sampleEdits: TreeEdit[] = [
// 	{
// 		type: "insert",
// 		content: { [typeField]: Vector.identifier, x: 3, y: 3, z: 0 },
// 		destination: { type: "objectPlace", [objectIdKey]: 2, place: "after" },
// 	},
// 	{
// 		type: "modify",
// 		target: { [objectIdKey]: 1 },
// 		field: "z",
// 		modification: 0,
// 	},
// 	{
// 		type: "modify",
// 		target: { [objectIdKey]: 2 },
// 		field: "z",
// 		modification: 0,
// 	},
// ];
