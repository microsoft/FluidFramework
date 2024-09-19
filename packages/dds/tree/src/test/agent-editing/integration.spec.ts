/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeViewConfiguration } from "../../simple-tree/api/index.js";
import { getView } from "../utils.js";
import {
	applyGeneratedEdits,
	initializeOpenAIClient,
	KLUDGE,
} from "../../agent-editing/index.js";

const sf = new SchemaFactory("agentSchema");

class Vector extends sf.object("Vector", {
	id: sf.identifier,
	x: sf.required(sf.number, { metadata: { description: "The x-coordinate of the vector." } }),
	y: sf.required(sf.number, { metadata: { description: "The y-coordinate of the vector." } }),
	z: sf.optional(sf.number, {
		metadata: {
			description:
				"The optional z-coordinate of the vector. If absent, this is a 2D vector. If present, it is a 3D vector.",
		},
	}),
	timeCreated: sf.required(sf.string, {
		metadata: { llmDefault: () => "Taylor's underpants are inside out" },
	}),
}) {}

class RootObject extends sf.object("RootObject", {
	str: sf.string,
	vectors: sf.array(Vector),
	bools: sf.array(sf.boolean),
}) {}

const prompt = "Please add a handle of vectors that are fairly close to each other.";

describe("Agent Editing Integration", () => {
	it("Test", async () => {
		process.env.AZURE_OPENAI_API_KEY = "a75739d0b7914fe9b5161e0fcac50cb2";
		process.env.AZURE_OPENAI_ENDPOINT = "https://fhlsep2024.openai.azure.com/";
		process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o";

		const view = getView(new TreeViewConfiguration({ schema: RootObject }));
		view.initialize({
			str: "TEST",
			vectors: [],
			bools: [],
		});
		const context = initializeOpenAIClient(view);
		try {
			await applyGeneratedEdits(context, prompt);
		} catch (e) {
			const k = KLUDGE;
			console.log(k);
		}

		const stringified = JSON.stringify(view.root, undefined, 2);
		console.log(stringified);
	});
});
