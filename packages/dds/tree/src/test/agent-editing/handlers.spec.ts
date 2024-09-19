/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
// eslint-disable-next-line import/no-internal-modules
import { TreeViewConfiguration } from "../../simple-tree/api/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getView } from "../utils.js";
import { generateHandlers } from "../../agent-editing/handlers.js";
import { createResponseHandler } from "../../json-handler/jsonHandler.js";

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
		// view.initialize(
		// 	new RootObject({
		// 		str: "hello",
		// 		vectors: [{ x: 1, y: 2, z: 3 }],
		// 		bools: [true],
		// 	}),
		// );
		const handler = generateHandlers(view, new Map());
		const jsonSchema = createResponseHandler(handler, new AbortController()).jsonSchema();
		debugger;
	});
});
