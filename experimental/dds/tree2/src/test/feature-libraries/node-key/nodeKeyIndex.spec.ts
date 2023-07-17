/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { nodeKeyField, nodeKeySchema, nodeKeyTreeSchema } from "../../../domains";
import {
	SchemaBuilder,
	FieldKinds,
	NodeKeyIndex,
	LocalNodeKey,
	localNodeKeySymbol,
	createMockNodeKeyManager,
	StableNodeKey,
	nodeKeyFieldKey,
} from "../../../feature-libraries";
import { ISharedTreeView, createSharedTreeView } from "../../../shared-tree";
import { compareSets } from "../../../util";
import { SummarizeType, TestTreeProvider, initializeTestTree } from "../../utils";
import { AllowedUpdateType } from "../../../core";

const builder = new SchemaBuilder("node key index tests", nodeKeySchema);
const nodeSchema = builder.structRecursive("node", {
	...nodeKeyField,
	child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchema),
});
const nodeSchemaData = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(nodeSchema));

// TODO: this can probably be removed once daesun's stuff goes in
function contextualizeKey(
	view: ISharedTreeView,
	key: LocalNodeKey,
): { [nodeKeyFieldKey]: StableNodeKey } {
	return {
		[nodeKeyFieldKey]: view.nodeKey.stabilize(key),
	};
}

describe("Node Key Index", () => {
	function createView(): ISharedTreeView {
		return createSharedTreeView({ nodeKeyManager: createMockNodeKeyManager() });
	}

	function assertIds(tree: ISharedTreeView, ids: LocalNodeKey[]): void {
		assert.equal(tree.nodeKey.map.size, ids.length);
		for (const id of ids) {
			assert(tree.nodeKey.map.has(id));
			const node = tree.nodeKey.map.get(id);
			assert(node !== undefined);
			assert.equal(node[localNodeKeySymbol], id);
		}
		assert(compareSets({ a: new Set(tree.nodeKey.map.keys()), b: new Set(ids) }));
	}

	it("can look up a node that was inserted", () => {
		const view = createView();
		const key = view.nodeKey.generate();
		const typedView = view.schematize({
			initialTree: {
				child: undefined,
				...contextualizeKey(view, key),
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});
		assertIds(typedView, [key]);
	});

	it("can look up multiple nodes that were inserted at once", () => {
		const view = createView();
		const keys = [view.nodeKey.generate(), view.nodeKey.generate(), view.nodeKey.generate()];
		const typedView = view.schematize({
			initialTree: {
				...contextualizeKey(view, keys[0]),
				child: {
					...contextualizeKey(view, keys[1]),
					child: {
						...contextualizeKey(view, keys[2]),
						child: undefined,
					},
				},
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});
		assertIds(typedView, keys);
	});

	it("can look up multiple nodes that were inserted over time", () => {
		const view = createView();
		const keyA = view.nodeKey.generate();
		const typedView = view.schematize({
			initialTree: {
				...contextualizeKey(view, keyA),
				child: undefined,
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});

		const node = typedView.nodeKey.map.get(keyA);
		assert(node !== undefined);
		const keyB = typedView.nodeKey.generate();
		node.child = { ...contextualizeKey(typedView, keyB) };
		assertIds(typedView, [keyA, keyB]);
	});

	it("forgets about nodes that are deleted", () => {
		const view = createView();
		const typedView = view.schematize({
			initialTree: {
				...contextualizeKey(view, view.nodeKey.generate()),
				child: undefined,
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});

		typedView.root = undefined;
		assertIds(typedView, []);
	});

	it("fails if multiple nodes have the same key", () => {
		const view = createView();
		const key = view.nodeKey.generate();
		assert.throws(
			() =>
				view.schematize({
					initialTree: {
						...contextualizeKey(view, key),
						child: {
							...contextualizeKey(view, key),
							child: undefined,
						},
					},
					schema: nodeSchemaData,
					allowedSchemaModifications: AllowedUpdateType.None,
				}),
			(e) => validateAssertionError(e, "Encountered duplicate node key"),
		);
	});

	it("can look up a node that was loaded from summary", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [tree] = provider.trees;
		const key = tree.nodeKey.generate();
		tree.schematize({
			initialTree: {
				...contextualizeKey(tree, key),
				child: undefined,
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});
		await provider.ensureSynchronized();

		await provider.summarize();
		const tree2 = await provider.createTree();
		await provider.ensureSynchronized();
		assertIds(tree2, [tree2.nodeKey.localize(tree.nodeKey.stabilize(key))]);
	});

	it("errors on nodes which have keys of the wrong type", () => {
		assert.throws(
			() =>
				initializeTestTree(
					createView(),
					{
						type: nodeSchema.name,
						fields: {
							[nodeKeyFieldKey]: [{ type: nodeKeyTreeSchema.name, value: {} }],
						},
					},
					nodeSchemaData,
				),
			(e) => validateAssertionError(e, "Malformed value encountered in node key field"),
		);
	});

	it("errors on nodes which should have keys, but do not", () => {
		const view = createView();
		assert.throws(
			() =>
				view.schematize({
					// @ts-expect-error Wrong type
					initialTree: {
						child: undefined,
					},
					schema: nodeSchemaData,
					allowedSchemaModifications: AllowedUpdateType.None,
				}),
			(e) => validateAssertionError(e, "Node key absent but required by schema"),
		);
	});

	it("is disabled if node type is not in the tree schema", () => {
		const builder2 = new SchemaBuilder("node key index test");
		const nodeSchemaNoKey = builder2.structRecursive("node", {
			child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchemaNoKey),
		});
		// This is missing the global node key field
		const nodeSchemaDataNoKey = builder2.intoDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoKey),
		);
		assert(!nodeSchemaDataNoKey.treeSchema.has(nodeKeyTreeSchema.name));

		const view = createView();
		initializeTestTree(
			view,
			{
				type: nodeSchema.name,
				fields: {
					[nodeKeyFieldKey]: [
						{ type: nodeKeyTreeSchema.name, value: view.nodeKey.generate() },
					],
				},
			},
			nodeSchemaDataNoKey,
		);
		assertIds(view, []);
		assert(!NodeKeyIndex.hasNodeKeyTreeSchema(view.context.schema));
	});

	it("is synchronized after each batch update", () => {
		const view = createView();
		const key = view.nodeKey.generate();
		let expectedIds: LocalNodeKey[] = [key];
		let batches = 0;
		view.events.on("afterBatch", () => {
			assertIds(view, expectedIds);
			batches += 1;
		});

		const typedView = view.schematize({
			initialTree: {
				...contextualizeKey(view, key),
				child: undefined,
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});

		expectedIds = [];
		typedView.root = undefined;
		assert.equal(batches, 2);
	});

	// TODO: Schema changes are not yet fully hooked up to eventing. A schema change should probably trigger
	it.skip("reacts to schema changes", () => {
		// This is missing the global node key field on the node
		const builder2 = new SchemaBuilder("node key index test", nodeKeySchema);
		const nodeSchemaNoKey = builder2.structRecursive("node", {
			child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchemaNoKey),
		});
		const nodeSchemaDataNoKey = builder2.intoDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoKey),
		);

		const view = createView();
		const key = view.nodeKey.generate();
		const typedView = view.schematize({
			initialTree: {
				...contextualizeKey(view, key),
				child: undefined,
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});
		assertIds(typedView, [key]);
		typedView.storedSchema.update(nodeSchemaDataNoKey);
		assertIds(typedView, []);
		typedView.storedSchema.update(nodeSchemaData);
		assertIds(typedView, [key]);
	});

	function describeForkingTests(prefork: boolean): void {
		function getView(): ISharedTreeView {
			const view = createView();
			return prefork ? view.fork() : view;
		}
		describe(`forking from ${prefork ? "a fork" : "the root"}`, () => {
			it("does not mutate the base when mutating a fork", () => {
				const view = getView();
				const key = view.nodeKey.generate();
				const typedView = view.schematize({
					initialTree: {
						...contextualizeKey(view, key),
						child: undefined,
					},
					schema: nodeSchemaData,
					allowedSchemaModifications: AllowedUpdateType.None,
				});

				const fork = typedView.fork();
				fork.root = undefined;
				assertIds(typedView, [key]);
				assertIds(fork, []);
				typedView.merge(fork);
				assertIds(typedView, []);
			});

			it("does not mutate the fork when mutating a base", () => {
				const view = getView();
				const key = view.nodeKey.generate();
				const typedView = view.schematize({
					initialTree: {
						...contextualizeKey(view, key),
						child: undefined,
					},
					schema: nodeSchemaData,
					allowedSchemaModifications: AllowedUpdateType.None,
				});

				const fork = typedView.fork();
				typedView.root = undefined;
				assertIds(typedView, []);
				assertIds(fork, [key]);
				typedView.merge(fork);
				assertIds(typedView, []);
			});
		});
	}

	describeForkingTests(false);
	describeForkingTests(true);
});
