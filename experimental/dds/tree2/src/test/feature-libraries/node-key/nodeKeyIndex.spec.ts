/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { leaf, nodeKeyField, nodeKeySchema, nodeKeyTreeSchema } from "../../../domains";
import {
	SchemaBuilder,
	FieldKinds,
	NodeKeyIndex,
	LocalNodeKey,
	StableNodeKey,
	SchemaAware,
	nodeKeyFieldKey,
	TypedField,
	Any,
	createMockNodeKeyManager,
	FieldSchema,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { NodeKeys } from "../../../feature-libraries/editable-tree-2/nodeKeys";
import { SummarizeType, TestTreeProvider, treeWithContent } from "../../utils";
import { AllowedUpdateType } from "../../../core";

const builder = new SchemaBuilder({ scope: "node key index tests", libraries: [nodeKeySchema] });
const nodeSchema = builder.structRecursive("node", {
	...nodeKeyField,
	child: FieldSchema.createUnsafe(FieldKinds.optional, [() => nodeSchema]),
});
const nodeSchemaData = builder.toDocumentSchema(SchemaBuilder.fieldOptional(nodeSchema));

// TODO: this can probably be removed once daesun's stuff goes in
function contextualizeKey(view: NodeKeys, key: LocalNodeKey): { [nodeKeyFieldKey]: StableNodeKey } {
	return {
		[nodeKeyFieldKey]: view.stabilize(key),
	};
}

describe("Node Key Index", () => {
	function createView(
		initialTree: SchemaAware.TypedField<
			typeof nodeSchemaData.rootFieldSchema,
			SchemaAware.ApiMode.Simple
		>,
	): TypedField<typeof nodeSchemaData.rootFieldSchema> {
		return treeWithContent({ initialTree, schema: nodeSchemaData });
	}

	function assertIds(tree: NodeKeys, ids: LocalNodeKey[]): void {
		assert.equal(tree.map.size, ids.length);
		for (const id of ids) {
			assert(tree.map.has(id));
			const node = tree.map.get(id);
			assert(node !== undefined);
			assert.equal(node.localNodeKey, id);
		}
		assert.deepEqual(new Set(tree.map.keys()), new Set(ids));
	}

	it("can look up a node that was inserted", () => {
		const view = treeWithContent({ initialTree: undefined, schema: nodeSchemaData });
		const key = view.context.nodeKeys.generate();
		view.content = {
			child: undefined,
			...contextualizeKey(view.context.nodeKeys, key),
		};
		assertIds(view.context.nodeKeys, [key]);
	});

	it("can look up multiple nodes that were inserted at once", () => {
		const view = createView(undefined);
		const keys = [
			view.context.nodeKeys.generate(),
			view.context.nodeKeys.generate(),
			view.context.nodeKeys.generate(),
		];
		view.content = {
			...contextualizeKey(view.context.nodeKeys, keys[0]),
			child: {
				...contextualizeKey(view.context.nodeKeys, keys[1]),
				child: {
					...contextualizeKey(view.context.nodeKeys, keys[2]),
					child: undefined,
				},
			},
		};
		assertIds(view.context.nodeKeys, keys);
	});

	it("can look up multiple nodes that were inserted over time", () => {
		const view = createView(undefined);
		const keyA = view.context.nodeKeys.generate();
		view.content = {
			...contextualizeKey(view.context.nodeKeys, keyA),
			child: undefined,
		};

		const node = view.context.nodeKeys.map.get(keyA);
		assert(node !== undefined);
		const keyB = view.context.nodeKeys.generate();
		assert(node.is(nodeSchema));
		node.boxedChild.content = {
			[nodeKeyFieldKey]: node.context.nodeKeys.stabilize(keyB),
			child: undefined,
		};
		assertIds(view.context.nodeKeys, [keyA, keyB]);
	});

	it("forgets about nodes that are deleted", () => {
		const view = createView(undefined);
		view.content = {
			...contextualizeKey(view.context.nodeKeys, view.context.nodeKeys.generate()),
			child: undefined,
		};
		view.content = undefined;
		assertIds(view.context.nodeKeys, []);
	});

	it("fails if multiple nodes have the same key", () => {
		const view = createView(undefined);
		const key = view.context.nodeKeys.generate();
		assert.throws(
			() =>
				(view.content = {
					...contextualizeKey(view.context.nodeKeys, key),
					child: {
						...contextualizeKey(view.context.nodeKeys, key),
						child: undefined,
					},
				}),
			(e: Error) => validateAssertionError(e, "Encountered duplicate node key"),
		);
	});

	it("can look up a node that was loaded from summary", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [tree] = provider.trees;

		const manager1 = createMockNodeKeyManager();
		const key = manager1.generateLocalNodeKey();
		const view = tree.schematize({
			initialTree: {
				[nodeKeyFieldKey]: manager1.stabilizeNodeKey(key),
				child: undefined,
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});

		await provider.ensureSynchronized();

		await provider.summarize();
		const tree2 = await provider.createTree();
		await provider.ensureSynchronized();
		const manager2 = createMockNodeKeyManager();
		const view2 = tree2
			.schematize({
				initialTree: {
					[nodeKeyFieldKey]: "not used",
					child: undefined,
				},
				schema: nodeSchemaData,
				allowedSchemaModifications: AllowedUpdateType.None,
			})
			.editableTree2(nodeSchemaData, manager2);
		assertIds(view2.context.nodeKeys, [
			manager2.localizeNodeKey(manager1.stabilizeNodeKey(key)),
		]);
	});

	// TODO: this test doesn't work due to out of schema data. It should be replaced with a test that confirms that odd or invalid schema are handled properly instead.
	it.skip("errors on nodes which have keys of the wrong type", () => {
		assert.throws(
			() =>
				treeWithContent({
					initialTree: {
						[nodeKeyFieldKey]: 5 as unknown as StableNodeKey,
						child: undefined,
					},
					schema: nodeSchemaData,
				}),
			(e: Error) =>
				validateAssertionError(e, "Malformed value encountered in node key field"),
		);
	});

	// TODO: this test doesn't work due to out of schema data. It should be replaced with a test that confirms that odd or invalid schema are handled properly instead.

	it.skip("errors on nodes which should have keys, but do not", () => {
		const view = createView(undefined);
		assert.throws(
			() => {
				// @ts-expect-error: Wrong type
				view.content = {
					child: undefined,
				};
			},
			(e: Error) => validateAssertionError(e, "Node key absent but required by schema"),
		);
	});

	it("is disabled if node type is not in the tree schema", () => {
		const builder2 = new SchemaBuilder({
			scope: "test",
			name: "node key index test",
			libraries: [leaf.library],
		});
		const nodeSchemaNoKey = builder2.map("node", SchemaBuilder.fieldOptional(Any));

		const nodeSchemaDataNoKey = builder2.toDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoKey),
		);
		assert(!nodeSchemaDataNoKey.treeSchema.has(nodeKeyTreeSchema.name));

		const nodeKeyManager = createMockNodeKeyManager();

		const view = treeWithContent(
			{
				initialTree: {
					// @ts-expect-error: Strong typing for map node literals is not implemented yet
					[nodeKeyFieldKey]: nodeKeyManager.stabilizeNodeKey(
						nodeKeyManager.generateLocalNodeKey(),
					),
				},
				schema: nodeSchemaDataNoKey,
			},
			{ nodeKeyManager },
		);
		assertIds(view.context.nodeKeys, []);
		assert(!NodeKeyIndex.hasNodeKeyTreeSchema(view.context.schema));
	});

	it("is synchronized after each batch update", () => {
		const view = createView(undefined);
		const key = view.context.nodeKeys.generate();
		let expectedIds: LocalNodeKey[] = [key];
		let batches = 0;
		view.context.on("afterChange", () => {
			assertIds(view.context.nodeKeys, expectedIds);
			batches += 1;
		});

		view.content = {
			...contextualizeKey(view.context.nodeKeys, key),
			child: undefined,
		};

		expectedIds = [];
		view.content = undefined;
		assert.equal(batches, 2);
	});

	// TODO: branching and forking is not exposed in the new API, so these tests are disabled for now
	// TODO: Schema changes are not yet fully hooked up to eventing. A schema change should probably trigger
	/*
	it.skip("reacts to schema changes", () => {
		// This is missing the global node key field on the node
		const builder2 = new SchemaBuilder({
			scope: "node key index test",
			libraries: [nodeKeySchema],
		});
		const nodeSchemaNoKey = builder2.structRecursive("node", {
			child: FieldSchema.createUnsafe(FieldKinds.optional, [() => nodeSchemaNoKey]),
		});
		const nodeSchemaDataNoKey = builder2.toDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoKey),
		);

		const view = createView(undefined);
		const key = view.context.nodeKeys.generate();
		view.setContent({
			...contextualizeKey(view, key),
			child: undefined,
		});
		assertIds(view, [key]);
		view.storedSchema.update(nodeSchemaDataNoKey);
		assertIds(view, []);
		view.storedSchema.update(nodeSchemaData);
		assertIds(view, [key]);
	});

	function describeForkingTests(prefork: boolean): void {
		function getView(): ISharedTreeView {
			const view = createView(undefined);
			return prefork ? view.fork() : view;
		}
		describe(`forking from ${prefork ? "a fork" : "the root"}`, () => {
			it("does not mutate the base when mutating a fork", () => {
				const view = getView();
				const key = view.context.nodeKeys.generate();
				view.setContent({
					...contextualizeKey(view, key),
					child: undefined,
				});

				const fork = view.fork();
				fork.setContent(undefined);
				assertIds(view, [key]);
				assertIds(fork, []);
				view.merge(fork);
				assertIds(view, []);
			});

			it("does not mutate the fork when mutating a base", () => {
				const view = getView();
				const key = view.context.nodeKeys.generate();
				view.setContent({
					...contextualizeKey(view, key),
					child: undefined,
				});

				const fork = view.fork();
				view.setContent(undefined);
				assertIds(view, []);
				assertIds(fork, [key]);
				view.merge(fork);
				assertIds(view, []);
			});
		});
	}

	describeForkingTests(false);
	describeForkingTests(true);
	*/
});
