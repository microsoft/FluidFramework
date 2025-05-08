/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	getSimpleSchema,
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { z } from "zod";

import { buildFunc, exposeMethodsSymbol, type ExposedMethods } from "../methodBinding.js";
import { generateEditTypesForPrompt } from "../typeGeneration.js";
import { getFriendlySchemaName, getZodSchemaAsTypeScript } from "../utils.js";

const factory = SharedTree.getFactory();
const sf = new SchemaFactory("test");

class Todo extends sf.object("Todo", {
	title: sf.string,
	completed: sf.boolean,
}) {
	public M2(n: string): boolean {
		return false;
	}

	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.expose(Todo, "M2", buildFunc({ returns: z.boolean() }, ["n", z.string()]));
	}
}

class TestTodoAppSchema extends sf.object("TestTodoAppSchema", {
	title: sf.string,
	description: sf.string,
	todos: sf.array(Todo),
}) {
	public M1(n: number): boolean {
		return false;
	}

	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.expose(
			TestTodoAppSchema,
			"M1",
			buildFunc({ returns: z.boolean() }, ["num", z.number()]),
		);
	}
}

const initialAppState = {
	title: "My First Todo List",
	description: "This is a list of todos",
	todos: [
		{
			title: "Task 1",
			completed: true,
		},
		{
			title: "Task 2",
			completed: true,
		},
	],
};

describe("System prompt", () => {
	it("doesNodeContainArraySchema should return true if the node contains an array schema property", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		const schema = getSimpleSchema(view.schema);

		const { domainTypes } = generateEditTypesForPrompt(view.schema, schema, false);
		for (const [key, value] of Object.entries(domainTypes)) {
			const friendlyKey = getFriendlySchemaName(key);
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete domainTypes[key];
			if (
				friendlyKey !== undefined &&
				friendlyKey !== "string" &&
				friendlyKey !== "number" &&
				friendlyKey !== "boolean"
			) {
				domainTypes[friendlyKey] = value;
			}
		}

		const domainSchemaString = getZodSchemaAsTypeScript(domainTypes);
		assert.notDeepEqual(domainSchemaString, "");
	});
});
