/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactory,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
	createIdentifierIndex,
	type TreeNode,
} from "../../simple-tree/index.js";
import { getView, configureBenchmarkHooks } from "../utils.js";

import {
	defaultIndexBenchmarkSizes,
	deepTreeBenchmarkSizes,
	generateIndexBenchmarkSuite,
	type IndexBenchmarkScenario,
	type IndexBenchmarkSetup,
} from "./indexBenchmarkUtilities.js";

const schemaFactory = new SchemaFactory("identifierIndex.bench");

// -- Wide (flat) tree: one root with N leaf children in an array --

class WideChild extends schemaFactory.object("WideChild", {
	id: schemaFactory.identifier,
}) {}

class WideRoot extends schemaFactory.object("WideRoot", {
	id: schemaFactory.identifier,
	children: schemaFactory.array(WideChild),
}) {}

// -- Deep (tall) tree: a linear chain of N nodes --

class DeepNode extends schemaFactory.objectRecursive("DeepNode", {
	id: schemaFactory.identifier,
	child: schemaFactory.optionalRecursive([() => DeepNode]),
}) {}
{
	type _check = ValidateRecursiveSchema<typeof DeepNode>;
}

// -- Irregular tree: interior nodes have varying numbers of children at different depths --

class IrregularChildren extends schemaFactory.arrayRecursive("IrregularChildren", [
	() => IrregularNode,
]) {}
{
	type _check = ValidateRecursiveSchema<typeof IrregularChildren>;
}

class IrregularNode extends schemaFactory.objectRecursive("IrregularNode", {
	id: schemaFactory.identifier,
	children: IrregularChildren,
}) {}
{
	type _check = ValidateRecursiveSchema<typeof IrregularNode>;
}

function makeId(prefix: string, index: number): string {
	return `${prefix}-${index}`;
}

// ── Wide (flat) scenario ──

function createWideScenario(nodeCount: number): IndexBenchmarkScenario<string, TreeNode> {
	return {
		title: `wide tree with ${nodeCount} nodes`,
		setup(): IndexBenchmarkSetup<string, TreeNode> {
			const children = Array.from(
				{ length: nodeCount },
				(_, i) => new WideChild({ id: makeId("wide", i) }),
			);

			const config = new TreeViewConfiguration({ schema: WideRoot });
			const view = getView(config);
			view.initialize(new WideRoot({ id: "wide-root", children }));

			const index = createIdentifierIndex(view);
			const existingKeys = ["wide-root", ...children.map((_, i) => makeId("wide", i))];
			const missingKeys = Array.from({ length: 10 }, (_, i) => `miss-${i}`);

			let insertCounter = nodeCount;
			return {
				index,
				existingKeys,
				missingKeys,
				insertNode: () => {
					const id = makeId("wide", insertCounter++);
					view.root.children.insertAtEnd(new WideChild({ id }));
					return () => {
						view.root.children.removeAt(view.root.children.length - 1);
					};
				},
				removeNode: () => {
					const lastIndex = view.root.children.length - 1;
					const removedId = view.root.children[lastIndex]!.id;
					view.root.children.removeAt(lastIndex);
					return () => {
						view.root.children.insertAtEnd(new WideChild({ id: removedId }));
					};
				},
			};
		},
	};
}

// ── Deep (tall) scenario ──

function buildDeepChain(depth: number, ids: string[]): DeepNode {
	let current = new DeepNode({ id: ids[depth - 1]! });
	for (let i = depth - 2; i >= 0; i--) {
		current = new DeepNode({ id: ids[i]!, child: current });
	}
	return current;
}

function createDeepScenario(nodeCount: number): IndexBenchmarkScenario<string, TreeNode> {
	return {
		title: `deep tree with ${nodeCount} nodes`,
		setup(): IndexBenchmarkSetup<string, TreeNode> {
			const ids = Array.from({ length: nodeCount }, (_, i) => makeId("deep", i));
			const root = buildDeepChain(nodeCount, ids);

			const config = new TreeViewConfiguration({ schema: DeepNode });
			const view = getView(config);
			view.initialize(root);

			const index = createIdentifierIndex(view);
			const missingKeys = Array.from({ length: 10 }, (_, i) => `miss-${i}`);

			let insertCounter = nodeCount;
			const findDeepest = (): DeepNode => {
				let node = view.root;
				while (node.child !== undefined) {
					node = node.child;
				}
				return node;
			};

			return {
				index,
				existingKeys: ids,
				missingKeys,
				insertNode: () => {
					const deepest = findDeepest();
					const id = makeId("deep", insertCounter++);
					deepest.child = new DeepNode({ id });
					return () => {
						deepest.child = undefined;
					};
				},
				removeNode: () => {
					// Walk to parent-of-deepest and remove the leaf
					let parent = view.root;
					if (parent.child === undefined) {
						return () => {};
					}
					while (parent.child?.child !== undefined) {
						parent = parent.child;
					}
					const removedId = parent.child!.id;
					parent.child = undefined;
					return () => {
						parent.child = new DeepNode({ id: removedId });
					};
				},
			};
		},
	};
}

// ── Irregular (bushy) scenario ──
// Builds a tree where each level i has a branching factor of (i % 3) + 2,
// producing an uneven shape with varying widths at different depths.

function buildIrregularTree(targetCount: number): {
	root: IrregularNode;
	ids: string[];
} {
	let idCounter = 0;
	const ids: string[] = [];

	function buildLevel(remaining: number, depth: number): IrregularNode {
		const id = makeId("irreg", idCounter++);
		ids.push(id);
		const nodesLeft = remaining - 1;

		if (nodesLeft <= 0 || depth > 50) {
			return new IrregularNode({ id, children: new IrregularChildren([]) });
		}

		const branchingFactor = (depth % 3) + 2; // 2, 3, or 4 children per level
		const childCount = Math.min(branchingFactor, nodesLeft);
		const perChild = Math.floor(nodesLeft / childCount);
		const extraNodes = nodesLeft % childCount;

		const childNodes: IrregularNode[] = [];
		let allocated = 0;
		for (let i = 0; i < childCount && allocated < nodesLeft; i++) {
			const childBudget = perChild + (i < extraNodes ? 1 : 0);
			if (childBudget <= 0) break;
			childNodes.push(buildLevel(childBudget, depth + 1));
			allocated += childBudget;
		}

		return new IrregularNode({ id, children: new IrregularChildren(childNodes) });
	}

	const root = buildLevel(targetCount, 0);
	return { root, ids };
}

function createIrregularScenario(
	nodeCount: number,
): IndexBenchmarkScenario<string, TreeNode> {
	return {
		title: `irregular tree with ${nodeCount} nodes`,
		setup(): IndexBenchmarkSetup<string, TreeNode> {
			const { root, ids } = buildIrregularTree(nodeCount);

			const config = new TreeViewConfiguration({ schema: IrregularNode });
			const view = getView(config);
			view.initialize(root);

			const index = createIdentifierIndex(view);
			const missingKeys = Array.from({ length: 10 }, (_, i) => `miss-${i}`);

			let insertCounter = nodeCount;
			return {
				index,
				existingKeys: ids,
				missingKeys,
				insertNode: () => {
					const id = makeId("irreg", insertCounter++);
					view.root.children.insertAtEnd(
						new IrregularNode({
							id,
							children: new IrregularChildren([]),
						}),
					);
					return () => {
						view.root.children.removeAt(view.root.children.length - 1);
					};
				},
				removeNode: () => {
					const lastIndex = view.root.children.length - 1;
					const removed = view.root.children[lastIndex]!;
					const removedId = removed.id;
					view.root.children.removeAt(lastIndex);
					return () => {
						view.root.children.insertAtEnd(
							new IrregularNode({
								id: removedId,
								children: new IrregularChildren([]),
							}),
						);
					};
				},
			};
		},
	};
}

// ── Benchmark suites ──

describe("IdentifierIndex benchmarks", () => {
	configureBenchmarkHooks();

	describe("wide (flat) tree", () => {
		generateIndexBenchmarkSuite({
			indexName: "IdentifierIndex (wide)",
			sizes: defaultIndexBenchmarkSizes,
			createScenario: createWideScenario,
		});
	});

	describe("deep (tall) tree", () => {
		generateIndexBenchmarkSuite({
			indexName: "IdentifierIndex (deep)",
			sizes: deepTreeBenchmarkSizes,
			createScenario: createDeepScenario,
		});
	});

	describe("irregular (bushy) tree", () => {
		generateIndexBenchmarkSuite({
			indexName: "IdentifierIndex (irregular)",
			sizes: defaultIndexBenchmarkSizes,
			createScenario: createIrregularScenario,
		});
	});
});
