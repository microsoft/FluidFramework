/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
// eslint-disable-next-line import/order
import {
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

// eslint-disable-next-line import/no-internal-modules
import { doesNodeContainArraySchema } from "../../explicit-strategy/typeGeneration.js";

const factory = SharedTree.getFactory();
const sf = new SchemaFactory("test");

class Todo extends sf.object("Todo", {
	title: sf.string,
	completed: sf.boolean,
}) {}

class TestTodoAppSchema extends sf.object("TestTodoAppSchema", {
	title: sf.string,
	description: sf.string,
	todos: sf.array(Todo),
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

describe("Type Generation", () => {
	it("doesNodeContainArraySchema should return true if the node contains an array schema property", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		assert.equal(doesNodeContainArraySchema(view.root), true);
	});

	it("doesNodeContainArraySchema should return false if the node does NOT contain an array schema property", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		assert.equal(doesNodeContainArraySchema(view.root.todos[0]!), false);
	});

	it("doesNodeContainArraySchema should return true if the node is an array itself", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		assert.equal(doesNodeContainArraySchema(view.root.todos), true);
	});

	it("doesNodeContainArraySchema should return true if the node schema contains no array property but its child node does", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		class TestWrapperNode extends sf.object("TestWrapperNode", {
			childNodeProperty: TestTodoAppSchema,
		}) {}

		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestWrapperNode }));
		view.initialize({ childNodeProperty: initialAppState });

		assert.equal(doesNodeContainArraySchema(view.root), true);
	});
});
