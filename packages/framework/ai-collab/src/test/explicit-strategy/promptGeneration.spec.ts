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
	getSimpleSchema,
	SchemaFactory,
	SharedTree,
	Tree,
	TreeViewConfiguration,
	type TreeNode,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

// eslint-disable-next-line import/no-internal-modules
import { applyAgentEdit } from "../../explicit-strategy/agentEditReducer.js";
// eslint-disable-next-line import/no-internal-modules
import { IdGenerator } from "../../explicit-strategy/idGenerator.js";
import {
	createEditListHistoryPrompt,
	getEditingSystemPrompt,
	getPlanningSystemPrompt,
	getReviewSystemPrompt,
	toDecoratedJson,
	type EditLog,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/promptGeneration.js";

const factory = SharedTree.getFactory();
const sf = new SchemaFactory("test");

class Todo extends sf.object("Todo", {
	title: sf.required(sf.string, {
		metadata: { description: "The title of the todo" },
	}),
	completed: sf.required(sf.boolean, {
		metadata: { description: "Whether the todo is completed" },
	}),
}) {}

class TestTodoAppSchema extends sf.object("TestTodoAppSchema", {
	title: sf.required(sf.string, {
		metadata: { description: "The title of the group of todos" },
	}),
	description: sf.required(sf.string, {
		metadata: { description: "The description of the group of todos" },
	}),
	todos: sf.required(sf.array(Todo), {
		metadata: { description: "The list of todos" },
	}),
}) {}

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

// The following test suite checks the current state of prompt generated versus a snapshot of the last known expected prompt.
// If the prompt changes, these test will break and the snapshot should be updated. This suite effectively gives us a guard against unexpected prompt changes
// which are imperitive to be caught as even small changes can lead to incorrect LLM behavior.
describe("Prompt Generation Regression Tests", () => {
	let idGenerator: IdGenerator;
	beforeEach(() => {
		idGenerator = new IdGenerator();
	});

	const userAsk = "Change the completed to false for the first task and create a new edit";
	const systemRoleContext = "You're a helpful AI assistant";
	const plan =
		"Change the completed field to false for the todo at index 0 in the list of todos";

	const getExpectedEditingSystemPrompt = (params: {
		plan?: string;
		userAsk: string;
		editLog: EditLog;
		treeNode: TreeNode;
	}): string[] => {
		return [
			"",
			"\tYou are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.",
			"\t\t\tThe application that owns the JSON tree has the following guidance about your role: You're a helpful AI assistant",
			"\tEdits are JSON objects that conform to the following schema.",
			'\tThe top level object you produce is an "EditWrapper" object which contains one of "Insert", "Modify", "Remove", "Move", or null.',
			"\tinterface ObjectTarget {",
			"    target: string; // The id of the object (as specified by the object's __fluid_objectId property) that is being referenced",
			"}",
			"",
			"// A pointer to a location either just before or just after an object that is in an array",
			"interface ObjectPlace {",
			'    type: "objectPlace";',
			"    target: string; // The id (__fluid_objectId) of the object that the new/moved object should be placed relative to. This must be the id of an object that already existed in the tree content that was originally supplied.",
			'    place: "before" | "after"; // Where the new/moved object will be relative to the target object - either just before or just after',
			"}",
			"",
			'// either the "start" or "end" of an array, as specified by a "parent" ObjectTarget and a "field" name under which the array is stored (useful for prepending or appending)',
			"interface ArrayPlace {",
			'    type: "arrayPlace";',
			"    parentId: string; // The id (__fluid_objectId) of the parent object of the array. This must be the id of an object that already existed in the tree content that was originally supplied.",
			"    field: string; // The key of the array to insert into",
			'    location: "start" | "end"; // Where to insert into the array - either the start or the end',
			"}",
			"",
			'// A range of objects in the same array specified by a "from" and "to" Place. The "to" and "from" objects MUST be in the same array.',
			"interface Range {",
			"    from: ObjectPlace; // A pointer to a location either just before or just after an object that is in an array",
			"    to: ObjectPlace; // A pointer to a location either just before or just after an object that is in an array",
			"}",
			"",
			"// Inserts a new object at a specific Place or ArrayPlace.",
			"interface Insert {",
			'    type: "insert";',
			"    explanation: string; // A description of what this edit is meant to accomplish in human readable English",
			"    content: any; // Domain-specific content here",
			"    destination: ArrayPlace | ObjectPlace;",
			"}",
			"",
			"// Deletes an object or Range of objects from the tree.",
			"interface Remove {",
			'    type: "remove";',
			"    explanation: string; // A description of what this edit is meant to accomplish in human readable English",
			"    source: ObjectTarget | Range;",
			"}",
			"",
			"// Moves an object or Range of objects to a new Place or ArrayPlace.",
			"interface Move {",
			'    type: "move";',
			"    explanation: string; // A description of what this edit is meant to accomplish in human readable English",
			"    source: ObjectTarget | Range;",
			"    destination: ArrayPlace | ObjectPlace;",
			"}",
			"",
			"// Sets a field on a specific ObjectTarget.",
			"interface Modify {",
			'    type: "modify";',
			"    explanation: string; // A description of what this edit is meant to accomplish in human readable English",
			"    target: ObjectTarget;",
			'    field: "title" | "description" | "completed";',
			"    modification: any; // Domain-specific content here",
			"}",
			"",
			"interface EditWrapper {",
			"    edit: Insert | Remove | Move | Modify | null; // The next edit to apply to the tree, or null if the task is complete.",
			"}",
			"",
			"\tThe tree is a JSON object with the following schema: interface TestTodoAppSchema { title: string; description: string; todos: Todo[]; } interface Todo { title: string; completed: boolean; }",
			params.plan === undefined
				? "\t"
				: `\tYou have made a plan to accomplish the user's goal. The plan is: "${params.plan}". You will perform one or more edits that correspond to that plan to accomplish the goal.`,
			...(params.editLog?.length === 0
				? ["\t"]
				: [
						`\tYou have already performed the following edits:`,
						`\t\t\t${createEditListHistoryPrompt(params.editLog).split("\n")[0]}`,
						...(params.editLog.length > 1
							? createEditListHistoryPrompt(params.editLog).split("\n").slice(1)
							: []),
						`\t\t\tThis means that the current state of the tree reflects these changes.`,
					]),

			`\tThe current state of the tree is: ${toDecoratedJson(idGenerator, params.treeNode)}.`,
			`${params.editLog.length > 0 ? "\tBefore you made the above edits t" : "\tT"}he user requested you accomplish the following goal:`,
			`\t"${params.userAsk}"`,
			"\tIf the goal is now completed or is impossible, you should return null.",
			'\tOtherwise, you should create an edit that makes progress towards the goal. It should have an English description ("explanation") of which edit to perform (specifying one of the allowed edit types).',
		];
	};

	it("Planning Prompt has no regression", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		const actualPrompt = getPlanningSystemPrompt(view.root, userAsk, systemRoleContext).split(
			"\n",
		);

		const expectedPrompt = [
			"",
			"\tI'm an agent who makes plans for another agent to achieve a user-specified goal to update the state of an application.",
			"\t\t\tThe other agent follows this guidance: You're a helpful AI assistant",
			"\tThe application state tree is a JSON object with the following schema: interface TestTodoAppSchema { title: string; description: string; todos: Todo[]; } interface Todo { title: string; completed: boolean; }",
			'\tThe current state is: {"title":"My First Todo List","description":"This is a list of todos","todos":[{"title":"Task 1","completed":true},{"title":"Task 2","completed":true}]}.',
			"\tThe user requested that I accomplish the following goal:",
			`\t"${userAsk}"`,
			"\tI've made a plan to accomplish this goal by doing a sequence of edits to the tree.",
			"\tEdits can include setting the root, inserting, modifying, removing, or moving elements in the tree.",
			"\tHere is my plan:",
		];

		assert.deepStrictEqual(actualPrompt, expectedPrompt);
	});

	it("Editing System Prompt with no plan and empty edit log has no regression", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		idGenerator.assignIds(view.root);

		const actualPromptWithEmptyEditLogAndNoPlan = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			[],
			systemRoleContext,
		).split("\n");

		const expectedPromptWithEmptyEditLogAndNoPlan = getExpectedEditingSystemPrompt({
			plan: undefined,
			userAsk,
			editLog: [],
			treeNode: view.root,
		});
		assert.deepStrictEqual(
			actualPromptWithEmptyEditLogAndNoPlan,
			expectedPromptWithEmptyEditLogAndNoPlan,
		);
	});

	it("Editing System Prompt with plan and empty edit log has no regression", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		idGenerator.assignIds(view.root);
		const actualPromptWithEmptyEditLogAndPlan = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			[],
			systemRoleContext,
			plan,
		).split("\n");
		const expectedPromptWithEmptyEditLogAndPlan = getExpectedEditingSystemPrompt({
			plan,
			userAsk,
			editLog: [],
			treeNode: view.root,
		});

		assert.deepStrictEqual(
			actualPromptWithEmptyEditLogAndPlan,
			expectedPromptWithEmptyEditLogAndPlan,
		);
	});

	it("Editing System Prompt with plan and populated edit log has no regression", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		idGenerator.assignIds(view.root);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const todo1Id = idGenerator.getId(view.root.todos[0]!)!;

		const editLog: EditLog = [
			// We expect an error for this edit because the field is 'completed' not 'complete'
			{
				edit: {
					type: "modify",
					explanation:
						"Change the completed field to false for the todo at index 0 in the list of todos",
					target: { target: todo1Id },
					field: "complete",
					modification: false,
				},
			},
			{
				edit: {
					type: "modify",
					explanation:
						"Change the completed field to false for the todo at index 0 in the list of todos",
					target: { target: todo1Id },
					field: "completed",
					modification: false,
				},
			},
		];
		const simpleSchema = getSimpleSchema(Tree.schema(view.root));
		for (const editLogEntry of editLog) {
			try {
				applyAgentEdit(editLogEntry.edit, idGenerator, simpleSchema.definitions);
			} catch (error) {
				assert(error instanceof Error);
				editLogEntry.error = error.message;
			}
		}

		const actualPromptWithPlanAndEditLog = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			editLog,
			systemRoleContext,
			plan,
		).split("\n");

		const expectedPromptWithPlanAndEditLog = getExpectedEditingSystemPrompt({
			plan,
			userAsk,
			editLog,
			treeNode: view.root,
		});
		assert.deepStrictEqual(actualPromptWithPlanAndEditLog, expectedPromptWithPlanAndEditLog);

		// Another test for an edit log with a single edit
		const actualPromptWithPlanAndSingleEditEditLog = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			editLog,
			systemRoleContext,
			plan,
		).split("\n");

		const expectedPromptWithPlanAndSingleEditEditLog = getExpectedEditingSystemPrompt({
			plan,
			userAsk,
			editLog,
			treeNode: view.root,
		});
		assert.deepStrictEqual(
			actualPromptWithPlanAndSingleEditEditLog,
			expectedPromptWithPlanAndSingleEditEditLog,
		);
	});

	it("Review System Prompt has no regression", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		idGenerator.assignIds(view.root);

		const originalDecoratedJson = toDecoratedJson(idGenerator, view.root);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const todo1Id = idGenerator.getId(view.root.todos[0]!)!;
		const simpleSchema = getSimpleSchema(Tree.schema(view.root));
		applyAgentEdit(
			{
				type: "modify",
				explanation:
					"Change the completed field to false for the todo at index 0 in the list of todos",
				target: { target: todo1Id },
				field: "completed",
				modification: false,
			},
			idGenerator,
			simpleSchema.definitions,
		);

		const actualReviewSystemPrompt = getReviewSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			originalDecoratedJson,
			systemRoleContext,
		).split("\n");

		const modifiedDecoratedJson = toDecoratedJson(idGenerator, view.root);
		const expectedReviewSystemPrompt = [
			"",
			"\tYou are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.",
			"\t\t\tThe application that owns the JSON tree has the following guidance: You're a helpful AI assistant",
			"\tYou have performed a number of actions already to accomplish a user request.",
			"\tYou must review the resulting state to determine if the actions you performed successfully accomplished the user's goal.",
			"\tThe tree is a JSON object with the following schema: interface TestTodoAppSchema { title: string; description: string; todos: Todo[]; } interface Todo { title: string; completed: boolean; }",
			`\tThe state of the tree BEFORE changes was: ${originalDecoratedJson}.`,
			`\tThe state of the tree AFTER changes is: ${modifiedDecoratedJson}.`,
			"\tThe user requested that the following goal should be accomplished:",
			`\t${userAsk}`,
			"\tWas the goal accomplished?",
		];

		assert.deepStrictEqual(actualReviewSystemPrompt, expectedReviewSystemPrompt);
	});
});
