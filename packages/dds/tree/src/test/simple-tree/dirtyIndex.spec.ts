/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	SchemaFactory,
	TreeViewConfiguration,
	trackDirtyNodes,
	type DirtyTreeStatus,
	type ImplicitFieldSchema,
	type InsertableField,
	type TreeNode,
} from "../../simple-tree/index.js";
import { getView } from "../utils.js";

const sf = new SchemaFactory(undefined);

class Child extends sf.object("Child", {
	value: sf.number,
}) {}

class Parent extends sf.object("Parent", {
	child: Child,
	value: sf.optional(sf.number),
}) {}

class Root extends sf.object("Root", {
	parent: Parent,
}) {}

class Roots extends sf.object("Roots", {
	a: sf.array(Parent),
	b: sf.array(Parent),
}) {}

describe("dirty indexes", () => {
	function init<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		start: InsertableField<TSchema>,
	) {
		const view = getView(new TreeViewConfiguration({ schema }));
		view.initialize(start);
		const dirty = new WeakMap<TreeNode, DirtyTreeStatus>();
		trackDirtyNodes(view, dirty);
		return { root: view.root, index: dirty };
	}

	it("don't contain unchanged nodes", () => {
		const { root, index } = init(
			Root,
			new Root({ parent: new Parent({ child: new Child({ value: 3 }) }) }),
		);

		assert.equal(index.has(root), false);
		assert.equal(index.has(root.parent), false);
		assert.equal(index.has(root.parent.child), false);
	});

	it("return changed for changed nodes", () => {
		const { root, index } = init(
			Root,
			new Root({ parent: new Parent({ child: new Child({ value: 3 }) }) }),
		);

		root.parent.child.value = 4;
		assert.equal(index.has(root), false);
		assert.equal(index.has(root.parent), false);
		assert.equal(index.get(root.parent.child), "changed");
	});

	it("return new for new nodes", () => {
		const { root, index } = init(
			Root,
			new Root({ parent: new Parent({ child: new Child({ value: 3 }) }) }),
		);

		root.parent = new Parent({ child: new Child({ value: 4 }) });
		assert.equal(index.get(root), "changed");
		assert.equal(index.get(root.parent), "new");
		assert.equal(index.has(root.parent.child), false);
	});

	it("return moved for moved nodes", () => {
		const { root, index } = init(
			Roots,
			new Roots({ a: [new Parent({ child: new Child({ value: 3 }) })], b: [] }),
		);

		root.b.moveToEnd(0, root.a);

		assert.equal(index.get(root.a), "changed");
		assert.equal(index.get(root.b), "changed");
		assert.equal(index.get(root.b[0]), "moved");
		assert.equal(index.has(root.b[0].child), false);
	});

	it("give precedence to 'new' over 'changed'", () => {
		{
			const { root, index } = init(
				Root,
				new Root({ parent: new Parent({ child: new Child({ value: 3 }) }) }),
			);
			root.parent.child = new Child({ value: 4 });
			root.parent.child.value = 5;
			assert.equal(index.get(root.parent.child), "new");
		}
		{
			const { root, index } = init(
				Root,
				new Root({ parent: new Parent({ child: new Child({ value: 3 }) }) }),
			);
			root.parent.child.value = 5;
			root.parent.child = new Child({ value: 4 });
			assert.equal(index.get(root.parent.child), "new");
		}
	});

	it("give precedence to 'changed' over 'moved'", () => {
		{
			const { root, index } = init(
				Roots,
				new Roots({ a: [new Parent({ child: new Child({ value: 3 }) })], b: [] }),
			);
			root.a[0].child = new Child({ value: 4 });
			root.b.moveToEnd(0, root.a);
			assert.equal(index.get(root.b[0]), "changed");
		}
		{
			const { root, index } = init(
				Roots,
				new Roots({ a: [new Parent({ child: new Child({ value: 3 }) })], b: [] }),
			);
			root.b.moveToEnd(0, root.a);
			root.b[0].child = new Child({ value: 4 });
			assert.equal(index.get(root.b[0]), "changed");
		}
	});
});
