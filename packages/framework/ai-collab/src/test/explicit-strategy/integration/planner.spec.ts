/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable jsdoc/require-jsdoc */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { APIError, OpenAI } from "openai";

import { aiCollab } from "../../../index.js";

const sf = new SchemaFactory("ai-collab-sample-application");

export class SharedTreeTask extends sf.object("Task", {
	title: sf.string,
	id: sf.identifier,
	description: sf.string,
	priority: sf.string,
	complexity: sf.number,
	status: sf.string,
	assignee: sf.optional(sf.string),
}) {}

export class SharedTreeTaskList extends sf.array("TaskList", SharedTreeTask) {}

export class SharedTreeEngineer extends sf.object("Engineer", {
	name: sf.string,
	id: sf.identifier,
	skills: sf.string,
	maxCapacity: sf.number,
}) {}

export class SharedTreeEngineerList extends sf.array("EngineerList", SharedTreeEngineer) {}

export class SharedTreeTaskGroup extends sf.object("TaskGroup", {
	description: sf.string,
	id: sf.identifier,
	title: sf.string,
	tasks: SharedTreeTaskList,
	engineers: SharedTreeEngineerList,
	// optionalInfo: sf.optional(sf.string),
}) {}

export class SharedTreeTaskGroupList extends sf.array("TaskGroupList", SharedTreeTaskGroup) {}

export class SharedTreeAppState extends sf.object("AppState", {
	taskGroups: SharedTreeTaskGroupList,
	optionalInfo: sf.optional(sf.string),
}) {}

export const INITIAL_APP_STATE = {
	taskGroups: [
		{
			title: "My First Task Group",
			description: "Placeholder for first task group",
			tasks: [
				{
					assignee: "Alice",
					title: "Task #1",
					description:
						"This is the first task. Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "low",
					complexity: 1,
					status: "todo",
				},
				{
					assignee: "Bob",
					title: "Task #2",
					description:
						"This is the second task.  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "medium",
					complexity: 2,
					status: "in-progress",
				},
				{
					assignee: "Charlie",
					title: "Task #3",
					description:
						"This is the third task!  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "high",
					complexity: 3,
					status: "done",
				},
			],
			engineers: [
				{
					name: "Alice",
					maxCapacity: 15,
					skills:
						"Senior engineer capable of handling complex tasks. Versed in most languages",
				},
				{
					name: "Bob",
					maxCapacity: 12,
					skills:
						"Mid-level engineer capable of handling medium complexity tasks. Versed in React, Node.JS",
				},
				{
					name: "Charlie",
					maxCapacity: 7,
					skills: "Junior engineer capable of handling simple tasks. Versed in Node.JS",
				},
			],
		},
		{
			title: "My Second Task Group",
			description: "Placeholder for second task group",
			tasks: [
				{
					assignee: "Alice",
					title: "Task #1",
					description:
						"This is the first task. Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "low",
					complexity: 1,
					status: "todo",
				},
				{
					assignee: "Bob",
					title: "Task #2",
					description:
						"This is the second task.  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "medium",
					complexity: 2,
					status: "in-progress",
				},
				{
					assignee: "Charlie",
					title: "Task #3",
					description:
						"This is the third task!  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "high",
					complexity: 3,
					status: "done",
				},
			],
			engineers: [
				{
					name: "Alice",
					maxCapacity: 15,
					skills:
						"Senior engineer capable of handling complex tasks. Versed in most languages",
				},
				{
					name: "Bob",
					maxCapacity: 12,
					skills:
						"Mid-level engineer capable of handling medium complexity tasks. Versed in React, Node.JS",
				},
				{
					name: "Charlie",
					maxCapacity: 7,
					skills: "Junior engineer capable of handling simple tasks. Versed in Node.JS",
				},
			],
		},
	],
} as const;

const factory = SharedTree.getFactory();

const OPENAI_API_KEY = "";

describe("Ai Planner App", () => {
	it.skip("Simple test", async () => {
		// mocha.setup({
		// 	timeout: 20000,
		// });

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: SharedTreeAppState }));
		view.initialize(INITIAL_APP_STATE);

		await aiCollab({
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				modelName: "gpt-4o",
			},
			treeView: view,
			prompt: {
				systemRoleContext:
					"You are a project manager overseeing a team of engineers and assigning tasks within task groups to them.",
				userAsk: "Change the first task group title to 'Hello World'",
			},
			planningStep: true,
			finalReviewStep: true,
			dumpDebugLog: true,
		});

		// assert.equal(view.root.taskGroups[0]?.title, "Hello World");
	});

	it.skip("VERY Simple test", async () => {
		class TestAppSchema extends sf.object("PrioritySpecification", {
			priority: sf.optional(sf.string),
		}) {}

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestAppSchema }));
		view.initialize({ priority: "low" });

		await aiCollab({
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				modelName: "gpt-4o",
			},
			treeView: view,
			prompt: {
				systemRoleContext: "You are a managing objects with a priority field.",
				userAsk: "Change the priority from low to high",
			},
			planningStep: true,
			finalReviewStep: true,
		});

		assert.equal(view.root.priority, "high");
	});

	it.skip("BUG: Invalid json schema produced when schema has no arrays", async () => {
		class TestAppSchema extends sf.object("TestAppSchema", {
			title: sf.string,
		}) {}

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestAppSchema }));
		view.initialize({ title: "Sample Title" });

		try {
			await aiCollab({
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					modelName: "gpt-4o",
				},
				treeView: view,
				prompt: {
					systemRoleContext: "You are a managing json objects",
					userAsk: "Change the `title` field to 'Hello World'",
				},
				planningStep: true,
				finalReviewStep: true,
			});
		} catch (error) {
			assert(error instanceof APIError);
			assert(error.status === 400);
			assert(error.type === "invalid_request_error");
			assert(
				error.message ===
					"400 Invalid schema for response_format 'SharedTreeAI': In context=('properties', 'edit', 'anyOf', '1', 'properties', 'content', 'not'), schema must have a 'type' key.",
			);
		}
	});

	it.skip("BUG: OpenAI structured output fails when json schema with psuedo optional field is used in response format", async () => {
		class TestAppSchemaWithOptionalProp extends sf.object("TestAppSchemaWithOptionalProp", {
			nonOptionalProp: sf.string,
			taskList: SharedTreeTaskList,
			optionalProp: sf.optional(sf.string),
		}) {}

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(
			new TreeViewConfiguration({ schema: TestAppSchemaWithOptionalProp }),
		);
		view.initialize({ nonOptionalProp: "Hello", taskList: [] });

		try {
			await aiCollab({
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					modelName: "gpt-4o",
				},
				treeView: view,
				prompt: {
					systemRoleContext: "You are a managing json objects",
					userAsk: "Change the `optionalProp` field to 'Hello World'",
				},
				planningStep: true,
				finalReviewStep: true,
			});
		} catch (error) {
			assert(error instanceof APIError);
			assert(error.status === 400);
			assert(error.type === "invalid_request_error");
			assert(
				error.message ===
					"Invalid schema for response_format 'SharedTreeAI'. Please ensure it is a valid JSON Schema.",
			);
		}

		class TestAppSchemaWithoutOptionalProp extends sf.object(
			"TestAppSchemaWithoutOptionalProp",
			{
				nonOptionalProp: sf.string,
			},
		) {}

		const tree2 = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree2",
		);
		const view2 = tree2.viewWith(
			new TreeViewConfiguration({ schema: TestAppSchemaWithoutOptionalProp }),
		);
		view2.initialize({ nonOptionalProp: "Hello" });

		await aiCollab({
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				modelName: "gpt-4o",
			},
			treeView: view,
			prompt: {
				systemRoleContext: "You are a managing json objects",
				userAsk: "Change the `optionalProp` field to 'Hello World'",
			},
			planningStep: true,
			finalReviewStep: true,
		});

		const jsonified = JSON.stringify(view.root);

		assert.equal(view.root.nonOptionalProp, "Hello World");
	});
});
