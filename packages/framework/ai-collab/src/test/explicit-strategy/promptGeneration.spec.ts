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
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { describe, it } from "mocha";

// eslint-disable-next-line import/no-internal-modules
import { applyAgentEdit } from "../../explicit-strategy/agentEditReducer.js";
// eslint-disable-next-line import/no-internal-modules
import { IdGenerator } from "../../explicit-strategy/idGenerator.js";
import {
	getEditingSystemPrompt,
	getPlanningSystemPrompt,
	getReviewSystemPrompt,
	toDecoratedJson,
	type EditLog,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/promptGeneration.js";

import { MochaSnapshotUnitTester } from "./utils.js";

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
	const snapShotTester = new MochaSnapshotUnitTester(
		`${process.cwd()}/src/test/explicit-strategy`,
		"Prompt_Regression_Snapshot_Tests",
	);

	beforeEach(() => {
		idGenerator = new IdGenerator();
	});

	const userAsk = "Change the completed to false for the first task and create a new edit";
	const systemRoleContext = "You're a helpful AI assistant";
	const plan =
		"Change the completed field to false for the todo at index 0 in the list of todos";
	it("Planning Prompt has no regression", function (this: Mocha.Context) {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		const actualPrompt = getPlanningSystemPrompt(view.root, userAsk, systemRoleContext);

		snapShotTester.expectToMatchSnapshot(this, actualPrompt, "Planning_System_Prompt");
	});

	it("Editing System Prompt with no plan and empty edit log has no regression", function (this: Mocha.Context) {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		idGenerator.assignIds(view.root);

		const actualPrompt = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			[],
			systemRoleContext,
		);

		snapShotTester.expectToMatchSnapshot(
			this,
			actualPrompt,
			"Editing_System_Prompt_No_Plan_No_Log",
		);
	});

	it("Editing System Prompt using a tree node with a nested array property but no top level array should still contain array types", function (this: Mocha.Context) {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		class TestWrapperNode extends sf.object("TestWrapperNode", {
			childNodeProperty: TestTodoAppSchema,
		}) {}

		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestWrapperNode }));

		view.initialize({ childNodeProperty: initialAppState });

		idGenerator.assignIds(view.root);

		const actualPrompt = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			[],
			systemRoleContext,
		);

		snapShotTester.expectToMatchSnapshot(
			this,
			actualPrompt,
			"Editing_System_Prompt_Nested_Array_Schema_But_No_Top_Level_Array",
		);
	});

	it("Editing System Prompt with plan and empty edit log has no regression", function (this: Mocha.Context) {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		idGenerator.assignIds(view.root);

		const actualPrompt = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			[],
			systemRoleContext,
			plan,
		);

		snapShotTester.expectToMatchSnapshot(
			this,
			actualPrompt,
			"Editing_System_Prompt_With_Plan_No_Log",
		);
	});

	it("Editing System Prompt with plan and populated edit log has no regression", function (this: Mocha.Context) {
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
					type: "setField",
					explanation:
						"Change the completed field to false for the todo at index 0 in the list of todos",
					target: { target: todo1Id },
					field: "complete",
					newValue: false,
				},
			},
			{
				edit: {
					type: "setField",
					explanation:
						"Change the completed field to false for the todo at index 0 in the list of todos",
					target: { target: todo1Id },
					field: "completed",
					newValue: false,
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

		const actualPrompt = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			editLog,
			systemRoleContext,
			plan,
		);

		snapShotTester.expectToMatchSnapshot(
			this,
			actualPrompt,
			"Editing_System_Prompt_With_Plan_With_Log",
		);
	});

	it("Editing System Prompt created with node containing no arrays has no regression", function (this: Mocha.Context) {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		idGenerator.assignIds(view.root);

		const actualPrompt = getEditingSystemPrompt(
			userAsk,
			idGenerator,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			view.root.todos[0]!,
			[],
			systemRoleContext,
		);

		snapShotTester.expectToMatchSnapshot(
			this,
			actualPrompt,
			"Editing_System_Prompt_No_Plan_No_Log_No_Arrays",
		);
	});

	it("Review System Prompt has no regression", function (this: Mocha.Context) {
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
				type: "setField",
				explanation:
					"Change the completed field to false for the todo at index 0 in the list of todos",
				target: { target: todo1Id },
				field: "completed",
				newValue: false,
			},
			idGenerator,
			simpleSchema.definitions,
		);

		const actualPrompt = getReviewSystemPrompt(
			userAsk,
			idGenerator,
			view.root,
			originalDecoratedJson,
			systemRoleContext,
		);

		snapShotTester.expectToMatchSnapshot(this, actualPrompt, "Review_System_Prompt");
	});
});
