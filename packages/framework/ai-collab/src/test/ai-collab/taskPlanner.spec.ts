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
	SharedTree,
	TreeViewConfiguration,
	asTreeViewAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { APIError, OpenAI } from "openai";

import { aiCollab } from "../../index.js";

const sf = new SchemaFactory("ai-collab-sample-application");

class SharedTreeTask extends sf.object("Task", {
	title: sf.string,
	id: sf.identifier,
	description: sf.string,
	priority: sf.string,
	complexity: sf.number,
	status: sf.string,
	assignee: sf.string,
}) {}

class SharedTreeTaskList extends sf.array("TaskList", SharedTreeTask) {}

class SharedTreeEngineer extends sf.object("Engineer", {
	name: sf.string,
	id: sf.identifier,
	skills: sf.string,
	maxCapacity: sf.number,
}) {}

class SharedTreeEngineerList extends sf.array("EngineerList", SharedTreeEngineer) {}

class SharedTreeTaskGroup extends sf.object("TaskGroup", {
	description: sf.string,
	id: sf.identifier,
	title: sf.string,
	tasks: SharedTreeTaskList,
	engineers: SharedTreeEngineerList,
}) {}

class SharedTreeTaskGroupList extends sf.array("TaskGroupList", SharedTreeTaskGroup) {}

class SharedTreeAppState extends sf.object("AppState", {
	taskGroups: SharedTreeTaskGroupList,
}) {}

const INITIAL_APP_STATE = {
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

describe.skip("Ai Planner App", () => {
	it("should be able to change the priority of a task", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: SharedTreeAppState }));
		view.initialize(INITIAL_APP_STATE);

		await aiCollab({
			treeView: asTreeViewAlpha(view),
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				options: { model: "gpt-4o" },
			},
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			treeNode: view.root.taskGroups[0]!,
			prompt: {
				systemRoleContext:
					"You are a manager that is helping out with a project management tool. You have been asked to edit a group of tasks.",
				userAsk: "Change the priority of the first task from low to high",
			},
			planningStep: true,
			finalReviewStep: true,
		});

		assert(view.root.taskGroups[0]?.tasks[0]?.priority === "high");
	}).timeout(60000);

	it("BUG FIX REGRESSION: Using a tree node without any array in its schema now succeeds ", async () => {
		class TestAppSchema extends sf.object("PrioritySpecification", {
			priority: sf.string,
		}) {}

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestAppSchema }));
		view.initialize({ priority: "low" });

		await aiCollab({
			treeView: asTreeViewAlpha(view),
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				options: { model: "gpt-4o" },
			},
			treeNode: view.root,
			prompt: {
				systemRoleContext:
					"You are a manager that is helping out with a project management tool. You have been asked to edit a group of tasks.",
				userAsk: "Change the priority of the first task from low to high",
			},
			planningStep: true,
			finalReviewStep: true,
		});
		assert(view.root.priority === "high");
	}).timeout(60000);

	it.skip("BUG: Invalid json schema produced when schema has multiple keys with the same name and order", async () => {
		class TaskList extends sf.array("taskList", sf.string) {}

		class TestInnerAppSchema extends sf.object("TestInnerAppSchema", {
			title: sf.string,
		}) {}

		class TestAppSchema extends sf.object("TestAppSchema", {
			title: sf.string,
			taskList: TaskList,
			appData: TestInnerAppSchema,
		}) {}

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestAppSchema }));
		view.initialize({
			title: "Sample Title",
			taskList: [],
			appData: { title: "Inner App Data" },
		});

		try {
			await aiCollab({
				treeView: asTreeViewAlpha(view),
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					options: { model: "gpt-4o" },
				},
				treeNode: view.root,
				prompt: {
					systemRoleContext: "You are a managing json objects",
					userAsk: "Change the `title` field of the outer object to 'Hello World'",
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
					"400 Invalid schema for response_format 'SharedTreeAI'. Please ensure it is a valid JSON Schema.",
			);
		}
	}).timeout(60000);

	it.skip("BUG: OpenAI structured output fails when json schema with psuedo optional field is used in response format", async () => {
		class TaskList extends sf.array("taskList", sf.string) {}

		class TestAppSchemaWithOptionalProp extends sf.object("TestAppSchemaWithOptionalProp", {
			nonOptionalProp: sf.string,
			taskList: TaskList,
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
				treeView: asTreeViewAlpha(view),
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					options: { model: "gpt-4o" },
				},
				treeNode: view.root,
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
					"400 Invalid schema for response_format 'SharedTreeAI'. Please ensure it is a valid JSON Schema.",
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
			treeView: asTreeViewAlpha(view),
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				options: { model: "gpt-4o" },
			},
			treeNode: view.root,
			prompt: {
				systemRoleContext: "You are a managing json objects",
				userAsk: "Change the `optionalProp` field to 'Hello World'",
			},
			planningStep: true,
			finalReviewStep: true,
		});

		assert.equal(view.root.nonOptionalProp, "Hello World");
	}).timeout(60000);
});
