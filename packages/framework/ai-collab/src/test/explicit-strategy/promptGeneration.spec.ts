/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { describe, it } from "mocha";

// eslint-disable-next-line import/no-internal-modules
import { IdGenerator } from "../../explicit-strategy/idGenerator.js";
import {
	getEditingSystemPrompt,
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
			completed: false,
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

	it("Editing System Prompt with no plan and empty edit log has no regression", function (this: Mocha.Context) {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		idGenerator.assignIds(view.root);

		const actualPrompt = getEditingSystemPrompt(idGenerator, view.root);

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

		const actualPrompt = getEditingSystemPrompt(idGenerator, view.root);

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

		const actualPrompt = getEditingSystemPrompt(idGenerator, view.root);

		snapShotTester.expectToMatchSnapshot(
			this,
			actualPrompt,
			"Editing_System_Prompt_With_Plan_No_Log",
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
			idGenerator,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			view.root.todos[0]!,
		);

		snapShotTester.expectToMatchSnapshot(
			this,
			actualPrompt,
			"Editing_System_Prompt_No_Plan_No_Log_No_Arrays",
		);
	});
});
