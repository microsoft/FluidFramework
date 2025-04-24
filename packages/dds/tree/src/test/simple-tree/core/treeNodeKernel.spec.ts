/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, TreeViewConfiguration } from "../../../simple-tree/index.js";
// TODO: test other things from "treeNodeKernel" file.
// eslint-disable-next-line import/no-internal-modules
import { isTreeNode } from "../../../simple-tree/core/treeNodeKernel.js";

import { hydrate } from "../utils.js";
import { getView } from "../../utils.js";

describe("simple-tree proxies", () => {
	const sb = new SchemaFactory("test");

	const childSchema = sb.object("object", {
		content: sb.required(sb.number, { key: "storedContentKey" }),
	});

	const schema = sb.object("parent", {
		object: childSchema,
	});

	const initialTree = {
		object: { content: 42 },
	};

	it("isTreeNode", () => {
		// Non object
		assert(!isTreeNode(5));
		// Non node object
		assert(!isTreeNode({}));
		// Unhydrated/Raw node:
		assert(isTreeNode(new childSchema({ content: 5 })));
		// Hydrated node created during hydration:
		assert(isTreeNode(hydrate(schema, initialTree)));
		// Hydrated existing node:
		assert(isTreeNode(hydrate(childSchema, new childSchema({ content: 5 }))));
	});

	it("Marinated isTreeNode - initialize", () => {
		const config = new TreeViewConfiguration({ schema: sb.optional(schema) });

		const view = getView(config);

		view.initialize(undefined);
		const root = new schema({ object: { content: 6 } });
		assert(isTreeNode(root));
		view.root = root;
		// TODO: this case doesn't seem to produce a marinated node (or it got a flex tree node from some other source).
		assert(isTreeNode(root));
	});

	it("Marinated isTreeNode - inserted", () => {
		const config = new TreeViewConfiguration({ schema });

		const view = getView(config);
		const inner = { content: 6 };
		const root = new schema({ object: inner });
		assert(isTreeNode(root));
		assert(isTreeNode(root.object));
		assert(!isTreeNode(inner));
		view.initialize(root);
		assert(isTreeNode(root));
		assert(isTreeNode(root.object));
	});
});
