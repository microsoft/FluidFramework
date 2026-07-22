/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactory,
	TreeViewConfiguration,
	createIdentifierIndex,
} from "../../simple-tree/index.js";
import { getView, configureBenchmarkHooks } from "../utils.js";

import {
	defaultIndexBenchmarkSizes,
	generateIndexBenchmarkSuite,
	type IndexBenchmarkScenario,
	type IndexBenchmarkSetup,
} from "./indexBenchmarkUtilities.js";

const schemaFactory = new SchemaFactory("identifierIndex.bench");

class IndexedChild extends schemaFactory.object("IndexedChild", {
	id: schemaFactory.identifier,
}) {}

class IndexedParent extends schemaFactory.object("IndexedParent", {
	id: schemaFactory.identifier,
	children: schemaFactory.array(IndexedChild),
}) {}

/**
 * Creates identifiers for a given count, producing deterministic string IDs.
 */
function makeId(index: number): string {
	return `node-id-${index}`;
}

/**
 * Creates an identifier index benchmark scenario for a given number of child nodes.
 */
function createIdentifierIndexScenario(
	nodeCount: number,
): IndexBenchmarkScenario<string, import("../../simple-tree/index.js").TreeNode> {
	return {
		title: `IdentifierIndex with ${nodeCount} nodes`,
		setup(): IndexBenchmarkSetup<
			string,
			import("../../simple-tree/index.js").TreeNode
		> {
			const children = Array.from({ length: nodeCount }, (_, i) => {
				return new IndexedChild({ id: makeId(i) });
			});

			const config = new TreeViewConfiguration({ schema: IndexedParent });
			const view = getView(config);
			view.initialize(
				new IndexedParent({
					id: "root-id",
					children,
				}),
			);

			const index = createIdentifierIndex(view);

			// Existing keys: the root + all children
			const existingKeys = ["root-id", ...children.map((_, i) => makeId(i))];

			// Missing keys: IDs that definitely don't exist
			const missingKeys = Array.from({ length: 10 }, (_, i) => `missing-id-${i}`);

			// Track a counter for unique insertions across repeated calls
			let insertCounter = nodeCount;

			return {
				index,
				existingKeys,
				missingKeys,
				insertNode: () => {
					const newId = makeId(insertCounter++);
					view.root.children.insertAtEnd(new IndexedChild({ id: newId }));
				},
				removeNode: () => {
					if (view.root.children.length > 0) {
						view.root.children.removeAt(view.root.children.length - 1);
					}
				},
			};
		},
	};
}

describe("IdentifierIndex benchmarks", () => {
	configureBenchmarkHooks();

	generateIndexBenchmarkSuite({
		indexName: "IdentifierIndex",
		sizes: defaultIndexBenchmarkSizes,
		createScenario: createIdentifierIndexScenario,
	});
});
