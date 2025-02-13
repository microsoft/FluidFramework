/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { SessionId } from "@fluidframework/id-compressor";
import { createAlwaysFinalizedIdCompressor } from "@fluidframework/id-compressor/internal/test-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { typeboxValidator } from "../../external-utilities/index.js";
import {
	getBranch,
	type ISharedTree,
	type SharedTreeOptions,
	Tree,
} from "../../shared-tree/index.js";
import { TestTreeProviderLite, treeTestFactory } from "../utils.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { TreeFactory } from "../../treeFactory.js";

// Session ids used for the created trees' IdCompressors must be deterministic.
// TestTreeProviderLite does this by default.
// Test trees which manually create their data store runtime must set up their trees'
// session ids explicitly.
export const snapshotSessionId = "beefbeef-beef-4000-8000-000000000001" as SessionId;

export function createSnapshotCompressor() {
	return createAlwaysFinalizedIdCompressor(snapshotSessionId);
}

const enableSchemaValidation = true;

// TODO: The generated test trees should eventually be updated to use the chunked-forest.
export function generateTestTrees(options: SharedTreeOptions) {
	const factoryOptions: SharedTreeOptions = {
		jsonValidator: typeboxValidator,
		...options,
	};
	const factory = new TreeFactory(factoryOptions);
	const testTrees: {
		only?: boolean;
		skip?: boolean;
		name: string;
		runScenario: (
			takeSnapshot: (tree: ISharedTree, name: string) => Promise<void>,
		) => Promise<void>;
	}[] = [
		{
			name: "tree-with-identifier-field",
			runScenario: async (takeSnapshot) => {
				const provider = new TestTreeProviderLite(2, factory, true);
				const tree1 = provider.trees[0];
				const sf = new SchemaFactory("com.example");
				class SchemaWithIdentifier extends sf.object("parent", {
					identifier: sf.identifier,
				}) {}

				const view = tree1.viewWith(
					new TreeViewConfiguration({ schema: SchemaWithIdentifier }),
				);
				view.initialize({});

				provider.processMessages();

				await takeSnapshot(provider.trees[0], "final");
			},
		},
		{
			name: "move-across-fields",
			runScenario: async (takeSnapshot) => {
				const sf = new SchemaFactory("move-across-fields");
				const NodeSchema = sf.object("Node", {
					foo: sf.array(sf.string),
					bar: sf.array(sf.string),
				});

				const provider = new TestTreeProviderLite(2, factory, true);
				const tree = provider.trees[0];

				const view = tree.viewWith(
					new TreeViewConfiguration({
						schema: [NodeSchema],
						enableSchemaValidation,
					}),
				);
				view.initialize(new NodeSchema({ foo: ["a", "b", "c"], bar: ["d", "e", "f"] }));
				view.root.bar.moveRangeToIndex(1, 1, 3, view.root.foo);
				provider.processMessages();
				await takeSnapshot(provider.trees[0], "tree-0-final");
			},
		},
		{
			name: "insert-and-remove",
			runScenario: async (takeSnapshot) => {
				const sf = new SchemaFactory("insert-and-remove");
				const provider = new TestTreeProviderLite(2, factory, true);
				const tree1 = provider.trees[0];
				const view = tree1.viewWith(
					new TreeViewConfiguration({
						schema: [sf.array(sf.string)],
						enableSchemaValidation,
					}),
				);
				view.initialize([]);
				provider.processMessages();

				// Insert node
				view.root.insertAtStart("42");
				provider.processMessages();

				await takeSnapshot(provider.trees[0], "tree-0-after-insert");

				// Remove node
				view.root.removeRange(0, 1);
				provider.processMessages();

				await takeSnapshot(provider.trees[0], "tree-0-final");
				await takeSnapshot(provider.trees[1], "tree-1-final");
			},
		},
		{
			/**
			 * Aims to exercise interesting scenarios that can happen within an optional field with respect to
			 * EditManager's persisted format.
			 */
			name: "optional-field-scenarios",
			runScenario: async (takeSnapshot) => {
				const sf = new SchemaFactory("optional-field-scenarios");
				const MapNode = sf.map("Map", [sf.string, sf.number]);

				const provider = new TestTreeProviderLite(2, factory, true);
				const tree1 = provider.trees[0];
				const view1 = tree1.viewWith(
					new TreeViewConfiguration({
						schema: sf.optional(MapNode),
						enableSchemaValidation,
					}),
				);
				view1.initialize(undefined);
				view1.root = new MapNode([]);
				provider.processMessages();

				const tree2 = provider.trees[1];
				const view2 = tree2.viewWith(
					new TreeViewConfiguration({
						schema: sf.optional(MapNode),
						enableSchemaValidation,
					}),
				);
				view2.root?.set("root 1 child", 40);
				view2.root = new MapNode(new Map([["root 2 child", 41]]));

				// Transaction with a root and child change
				Tree.runTransaction(view1, () => {
					view1.root?.set("root 1 child", 42);
					view1.root = new MapNode([]);
					view1.root?.set("root 3 child", 43);
				});

				view1.root?.set("root 3 child", 44);

				provider.processMessages();

				// EditManager snapshot should involve information about rebasing tree1's edits (a transaction with root & child changes)
				// over tree2's edits (a root change and a child change outside of the transaction).
				await takeSnapshot(provider.trees[0], "final");
			},
		},
		{
			name: "competing-removes",
			runScenario: async (takeSnapshot) => {
				for (const index of [0, 1, 2, 3]) {
					const sf = new SchemaFactory("competing-removes");
					const provider = new TestTreeProviderLite(3, factory, true);
					const view1 = provider.trees[0].viewWith(
						new TreeViewConfiguration({
							schema: [sf.array(sf.number)],
							enableSchemaValidation,
						}),
					);
					view1.initialize([0, 1, 2, 3]);
					provider.processMessages();
					const view2 = provider.trees[1].viewWith(
						new TreeViewConfiguration({
							schema: [sf.array(sf.number)],
							enableSchemaValidation,
						}),
					);
					const view3 = provider.trees[2].viewWith(
						new TreeViewConfiguration({
							schema: [sf.array(sf.number)],
							enableSchemaValidation,
						}),
					);
					provider.processMessages();
					view1.root.removeAt(index);
					view2.root.removeAt(index);
					view3.root.removeAt(index);
					provider.processMessages();
					await takeSnapshot(provider.trees[0], `index-${index}`);
				}
			},
		},
		{
			name: "concurrent-inserts",
			runScenario: async (takeSnapshot) => {
				const sf = new SchemaFactory("concurrent-inserts");
				const provider = new TestTreeProviderLite(1, factory, true);
				const tree1 = provider.trees[0];
				const view1 = tree1.viewWith(
					new TreeViewConfiguration({
						schema: [sf.array(sf.string)],
						enableSchemaValidation,
					}),
				);
				view1.initialize([]);
				provider.processMessages();

				const branch1 = getBranch(tree1);
				const tree2 = branch1.branch();
				const view2 = tree2.viewWith(view1.config);
				view1.root.insertAt(0, "y");
				tree2.rebaseOnto(branch1);

				view1.root.insertAt(0, "x");
				view2.root.insertAt(1, "a", "c");
				view2.root.insertAt(2, "b");

				tree2.rebaseOnto(branch1);
				branch1.merge(tree2, false);

				provider.processMessages();
				await takeSnapshot(tree1, "tree2");

				assert.deepEqual(view1.root, ["x", "y", "a", "b", "c"]);
				assert.deepEqual(view1.root, view2.root);

				const tree3 = branch1.branch();
				const view3 = tree3.viewWith(view1.config);
				view1.root.insertAt(0, "z");
				view3.root.insertAt(1, "d", "e");
				view3.root.insertAt(2, "f");
				tree3.rebaseOnto(branch1);
				branch1.merge(tree3);

				provider.processMessages();
				await takeSnapshot(tree1, "tree3");
			},
		},
		{
			name: "complete-3x3",
			runScenario: async (takeSnapshot) => {
				function generateCompleteTree(
					mapKeys: string[],
					startingHeight: number,
					nodesPerField: number,
				): ISharedTree {
					const schemaFactory = new SchemaFactory("test trees");
					class StringArray extends schemaFactory.array("String Array", [
						schemaFactory.string,
					]) {}
					class RecursiveMap extends schemaFactory.mapRecursive("Recursive Map", [
						() => RecursiveMap,
						StringArray,
					]) {}

					const provider = new TestTreeProviderLite(1, new TreeFactory(options), true);
					const tree = provider.trees[0];
					const view = tree.viewWith(
						new TreeViewConfiguration({
							schema: [RecursiveMap, StringArray],
							enableSchemaValidation,
						}),
					);

					function generateTreeRecursively(
						keys: string[],
						height: number,
						currentValue: { value: number },
					): RecursiveMap | StringArray {
						if (height === 1) {
							const values: string[] = [];
							for (let i = 0; i < nodesPerField; i++) {
								values.push(currentValue.value.toString());
								currentValue.value++;
							}
							return new StringArray(values);
						} else {
							const map = new Map<string, RecursiveMap | StringArray>();
							if (height > 1) {
								for (const key of keys) {
									map.set(key, generateTreeRecursively(keys, height - 1, currentValue));
								}
							}
							return new RecursiveMap(map);
						}
					}

					view.initialize(generateTreeRecursively(mapKeys, startingHeight, { value: 1 }));
					provider.processMessages();
					return tree;
				}

				await takeSnapshot(
					generateCompleteTree(["FieldA", "FieldB", "FieldC"], 4, 3),
					"final",
				);
			},
		},
		{
			name: "has-handle",
			runScenario: async (takeSnapshot) => {
				const sf = new SchemaFactory("has-handle");
				const provider = new TestTreeProviderLite(1, factory, true);
				const tree = provider.trees[0];
				const view = tree.viewWith(
					new TreeViewConfiguration({
						schema: [sf.object("HandleObject", { handleField: sf.optional(sf.handle) })],
						enableSchemaValidation,
					}),
				);
				view.initialize({ handleField: undefined });
				provider.processMessages();

				view.root.handleField = tree.handle;
				provider.processMessages();

				await takeSnapshot(tree, "final");
			},
		},
		{
			name: "nested-sequence-change",
			runScenario: async (takeSnapshot) => {
				const sf = new SchemaFactory("test trees");
				class Array extends sf.arrayRecursive('Array<["test trees.Recursive Map"]>', [
					() => SequenceMap,
				]) {}
				class SequenceMap extends sf.mapRecursive("Recursive Map", [() => Array]) {}

				const provider = new TestTreeProviderLite(1, factory, true);
				const tree = provider.trees[0];
				const view = tree.viewWith(
					new TreeViewConfiguration({
						schema: Array,
						enableSchemaValidation,
					}),
				);
				view.initialize(new Array([]));
				provider.processMessages();

				// We must make this shallow change to the sequence field as part of the same transaction as the
				// nested change. Otherwise, the nested change will be represented using the generic field kind.
				Tree.runTransaction(view, () => {
					view.root.insertAtStart(new SequenceMap([]));
					const map = view.root[0];
					const innerArray: SequenceMap[] = [];
					map.set("foo", new Array([new SequenceMap([["bar", new Array(innerArray)]])]));
					// Since innerArray is an array, not an actual node, this does nothing (other than ensure innerArray was copied and thus the tree was not modified by this change)
					innerArray.push(new SequenceMap([]));
				});

				provider.processMessages();
				await takeSnapshot(tree, "final");
			},
		},
		{
			name: "empty-root",
			runScenario: async (takeSnapshot) => {
				const sf = new SchemaFactory("test trees");
				const provider = new TestTreeProviderLite(1, factory, true);
				const tree = provider.trees[0];
				const view = tree.viewWith(
					new TreeViewConfiguration({
						schema: sf.optional(sf.number),
						enableSchemaValidation,
					}),
				);
				view.initialize(undefined);
				provider.processMessages();
				await takeSnapshot(tree, "final");
			},
		},
		{
			name: "attachment-tree",
			runScenario: async (takeSnapshot) => {
				// This test makes changes only while detached to test EditManager's optimization of evicting/trimming
				// trunk commits outside of the collab window (which is all changes when detached).
				const tree = treeTestFactory({
					runtime: new MockFluidDataStoreRuntime({
						clientId: "test-client",
						id: "test",
						idCompressor: createSnapshotCompressor(),
					}),
					options: factoryOptions,
				});

				const sf = new SchemaFactory("attachment-tree");
				const view = tree.viewWith(
					new TreeViewConfiguration({
						schema: [sf.array(sf.string)],
						enableSchemaValidation,
					}),
				);
				view.initialize([]);
				view.root.insertAtStart("a");
				view.root.insertAtEnd("b");
				await takeSnapshot(tree, "final");
			},
		},
	];

	return testTrees;
}
