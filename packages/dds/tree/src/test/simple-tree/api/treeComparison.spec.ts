/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { getTreeDiff } from "../../../simple-tree/api/treeComparison.js";
import { SchemaFactory, TreeViewConfiguration } from "../../../simple-tree/index.js";
import { getView } from "../../utils.js";

describe.only("getChangedNodes", () => {
	const schema = new SchemaFactory("com.test");

	class TestSchema extends schema.object("TestObject", {
		name: schema.optional(schema.string),
		value: schema.optional(schema.number),
		extra: schema.optional(schema.string),
		items: schema.optional(schema.array(schema.number)),
	}) {}

	// Helper to create actual tree views with proper initialization
	function createView(initialData: TestSchema) {
		const config = new TreeViewConfiguration({ schema: TestSchema });
		const view = getView(config);
		view.initialize(initialData);
		return view;
	}

	it("returns empty array when trees are identical", () => {
		const data1 = { name: "test", value: 42 };
		const data2 = { name: "test", value: 42 };

		const view1 = createView(new TestSchema(data1));
		const view2 = createView(new TestSchema(data2));

		const result = getTreeDiff(view1, view2);
		assert.equal(result.size, 0);
	});

	it("returns nodes when primitive values differ", () => {
		const data1 = new TestSchema({ name: "test", value: 42 });
		const data2 = new TestSchema({ name: "test", value: 43 });

		const view1 = createView(data1);
		const view2 = createView(data2);

		const result = getTreeDiff(view1, view2);
		assert(result.size > 0);
		assert.deepEqual(Array.from(result), [data2]);
	});

	it("returns nodes when object structure differs", () => {
		const data1 = new TestSchema({ name: "test", value: 42, extra: "field" });
		const data2 = new TestSchema({ name: "test", value: 42 });

		const view1 = createView(data1);
		const view2 = createView(data2);

		const result = getTreeDiff(view1, view2);
		assert(result.size > 0);
		assert.deepEqual(Array.from(result), [data2]);
	});

	it("handles array differences", () => {
		const data1 = new TestSchema({ items: [1, 2, 3] });
		const data2 = new TestSchema({ items: [1, 2] });

		const view1 = createView(data1);
		const view2 = createView(data2);

		const result = getTreeDiff(view1, view2);
		assert(result.size > 0);
		assert.deepEqual(Array.from(result), [data2.items, data2]);
	});

	it("handles completely different tree structures", () => {
		const data1 = new TestSchema({ name: "test", value: 42 });
		const data2 = new TestSchema({ name: "different", value: 100, extra: "new" });

		const view1 = createView(data1);
		const view2 = createView(data2);

		const result = getTreeDiff(view1, view2);
		assert(result.size > 0);
		assert.deepEqual(Array.from(result), [data2]);
	});

	it("handles nested object differences", () => {
		const NestedSchema = schema.object("Nested", {
			level1: schema.object("Level1", {
				level2: schema.object("Level2", {
					value: schema.number,
				}),
			}),
		});
		const config = new TreeViewConfiguration({ schema: NestedSchema });

		const view1 = getView(config);
		view1.initialize({ level1: { level2: { value: 42 } } });

		const view2 = getView(config);
		view2.initialize({ level1: { level2: { value: 43 } } });

		const result = getTreeDiff(view1, view2);
		assert(result.size > 0);
	});

	it("returns empty array for simple identical primitives", () => {
		const StringSchema = schema.string;
		const config1 = new TreeViewConfiguration({ schema: StringSchema });
		const config2 = new TreeViewConfiguration({ schema: StringSchema });

		const view1 = getView(config1);
		view1.initialize("hello");

		const view2 = getView(config2);
		view2.initialize("hello");

		const result = getTreeDiff(view1, view2);
		assert.equal(result.size, 0);
	});

	it("returns changed primitive values", () => {
		const NumberSchema = schema.number;
		const config1 = new TreeViewConfiguration({ schema: NumberSchema });
		const config2 = new TreeViewConfiguration({ schema: NumberSchema });

		const view1 = getView(config1);
		view1.initialize(42);

		const view2 = getView(config2);
		view2.initialize(43);

		const result = getTreeDiff(view1, view2);
		assert(result.size > 0);
		assert.deepEqual(Array.from(result), [43]);
	});
});
