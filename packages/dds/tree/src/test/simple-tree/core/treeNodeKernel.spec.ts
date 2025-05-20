/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, TreeViewConfiguration } from "../../../simple-tree/index.js";
// TODO: test other things from "treeNodeKernel" file.
// eslint-disable-next-line import/no-internal-modules
import { getKernel, isTreeNode } from "../../../simple-tree/core/treeNodeKernel.js";

import { hydrate } from "../utils.js";
import { getView } from "../../utils.js";
import { AnchorSet, rootFieldKey, type UpPath } from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
import { TreeStatus } from "../../../feature-libraries/index.js";

describe("simple-tree proxies", () => {
	const sb = new SchemaFactory("test");

	class ChildSchema extends sb.object("object", {
		content: sb.required(sb.number, { key: "storedContentKey" }),
	}) {}

	class Schema extends sb.object("parent", {
		object: ChildSchema,
	}) {}

	const initialTree = {
		object: { content: 42 },
	};

	it("isTreeNode", () => {
		// Non object
		assert(!isTreeNode(5));
		// Non node object
		assert(!isTreeNode({}));
		// Unhydrated/Raw node:
		assert(isTreeNode(new ChildSchema({ content: 5 })));
		// Hydrated node created during hydration:
		assert(isTreeNode(hydrate(Schema, initialTree)));
		// Hydrated existing node:
		assert(isTreeNode(hydrate(ChildSchema, new ChildSchema({ content: 5 }))));
	});

	it("Marinated isTreeNode - initialize", () => {
		const config = new TreeViewConfiguration({ schema: sb.optional(Schema) });

		const view = getView(config);

		view.initialize(undefined);
		const root = new Schema({ object: { content: 6 } });
		assert(isTreeNode(root));
		view.root = root;
		// TODO: this case doesn't seem to produce a marinated node (or it got a flex tree node from some other source).
		assert(isTreeNode(root));
	});

	it("Marinated isTreeNode - inserted", () => {
		const config = new TreeViewConfiguration({ schema: Schema });

		const view = getView(config);
		const inner = { content: 6 };
		const root = new Schema({ object: inner });
		assert(isTreeNode(root));
		assert(isTreeNode(root.object));
		assert(!isTreeNode(inner));
		view.initialize(root);
		assert(isTreeNode(root));
		assert(isTreeNode(root.object));
	});

	it("Hydrate", () => {
		const child = new ChildSchema({ content: 1 });
		const path: UpPath = {
			parent: { parent: undefined, parentField: brand("root"), parentIndex: 2 },
			parentField: brand("child"),
			parentIndex: 3,
		};
		const anchors = new AnchorSet();
		const kernel = getKernel(child);

		assert.equal(kernel.getStatus(), TreeStatus.New);
		assert(!kernel.isHydrated());
		kernel.hydrate(anchors, path);
		assert(kernel.isHydrated());
		assert.equal(kernel.getStatus(), TreeStatus.Removed);

		const anchor = anchors.track(path);
		const anchorNode = anchors.locate(anchor);
		assert.equal(kernel.anchorNode, anchorNode);

		assert.throws(
			() => {
				kernel.hydrate(anchors, path);
			},
			(e: Error) => validateAssertionError(e, "hydration should only happen once"),
		);

		const visitor = anchors.acquireVisitor();
		// AnchorSet doesn't know how many children there are, so just provide an arbitrary number larger than its largest index
		visitor.destroy(brand("root"), 100);
		visitor.free();

		assert.equal(kernel.getStatus(), TreeStatus.Deleted);
	});

	it("Hydrate - ref counting - marinated ", () => {
		const child = new ChildSchema({ content: 1 });
		const path: UpPath = {
			parent: { parent: undefined, parentField: brand("root"), parentIndex: 2 },
			parentField: brand("child"),
			parentIndex: 3,
		};
		const anchors = new AnchorSet();
		const kernel = getKernel(child);

		assert(anchors.isEmpty());
		kernel.hydrate(anchors, path);
		assert(!anchors.isEmpty());

		const anchorNode = kernel.anchorNode;

		// Check anchor is still tracked by anchors (this would not be the case if kernel did not hold a ref count for it)
		assert.equal(anchors.find(path), anchorNode);

		kernel.dispose();

		// AnchorSet is now empty
		assert.equal(anchors.find(path), undefined);
		assert(anchors.isEmpty());
	});

	for (const cooked of [false, true]) {
		it(`Hydrate - ref counting - end to end - cooked: ${cooked}`, () => {
			const child = new ChildSchema({ content: 1 });
			const path: UpPath = { parent: undefined, parentField: rootFieldKey, parentIndex: 0 };

			const kernel = getKernel(child);

			const view = getView(
				new TreeViewConfiguration({ schema: SchemaFactory.optional(ChildSchema) }),
			);
			view.initialize(undefined);

			const anchors = view.checkout.forest.anchors;

			assert.equal(anchors.find(path), undefined);

			view.root = child;
			assert(!anchors.isEmpty());

			const anchorNode = kernel.anchorNode;
			if (cooked) {
				const inner = kernel.getOrCreateInnerNode();
			}

			assert.equal(anchors.find(path), anchorNode);
			view.dispose();

			// AnchorSet is now empty
			assert.equal(anchors.find(path), undefined);
			assert(anchors.isEmpty());
		});
	}
});
