/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { brand } from "../../util/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	createIdentifierIndex,
} from "../../simple-tree/index.js";
import { getView } from "../utils.js";
import type { FieldKey } from "../../core/index.js";

/** The identifier of the parent node */
const parentId: FieldKey = brand("parentId");
/** The identifier of the child node */
const childId: FieldKey = brand("childId");

const schemaFactory = new SchemaFactory(undefined);

class NonIndexableChild extends schemaFactory.object("NonIndexableChild", {
	childKey: schemaFactory.string,
}) {}

class IndexableChild extends schemaFactory.object("IndexableChild", {
	childKey: schemaFactory.identifier,
}) {}
class IndexableParent extends schemaFactory.object("IndexableParent", {
	parentKey: schemaFactory.identifier,
	child: schemaFactory.optional(IndexableChild),
	nonIndexableChild: schemaFactory.optional(NonIndexableChild),
}) {}

function createView(child?: IndexableChild) {
	const config = new TreeViewConfiguration({ schema: IndexableParent });
	const view = getView(config);
	view.initialize(new IndexableParent({ parentKey: parentId, child }));

	return { view, parent: view.root };
}

describe("identifier indexes", () => {
	function init(child: IndexableChild) {
		const { view, parent } = createView(child);
		const index = createIdentifierIndex(view);
		return { parent, index };
	}

	it("can look up nodes", () => {
		const { parent, index } = init(new IndexableChild({ childKey: childId }));
		assert.equal(index.get(parentId), parent);
		const child = parent.child;
		assert(child !== undefined);
		assert.equal(index.get(childId), child);
		assert.equal(index.size, 2);
	});

	it("do not index nodes without identifiers", () => {
		const { parent, index } = init(new IndexableChild({ childKey: childId }));
		parent.nonIndexableChild = new NonIndexableChild({ childKey: "test" });
		assert.equal(index.get("test"), undefined);
		assert.equal(index.size, 2);
	});

	it("indexes newly inserted nodes", () => {
		const { parent, index } = init(new IndexableChild({ childKey: childId }));
		parent.child = new IndexableChild({ childKey: `${childId}2` });
		assert.equal(index.get(parentId), parent);
		assert.equal(index.get(`${childId}2`), parent.child);
		assert.equal(index.get(childId), undefined);
	});

	it("does not index detached nodes", () => {
		const { parent, index } = init(new IndexableChild({ childKey: childId }));
		const child = parent.child;
		assert(child !== undefined);
		assert.equal(index.get(childId), child);
		assert.equal(index.size, 2);
		parent.child = undefined;
		assert.equal(index.get(parentId), parent);
		assert.equal(index.get(childId), undefined);
		assert.equal(index.size, 1);
	});

	it("fail on lookup if two nodes have the same key", () => {
		const { index } = init(new IndexableChild({ childKey: parentId }));
		assert.throws(() => index.get(parentId));
	});
});
