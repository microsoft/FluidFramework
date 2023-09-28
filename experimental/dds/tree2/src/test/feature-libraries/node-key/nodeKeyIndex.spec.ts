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
	setField,
	SchemaAware,
} from "../../../feature-libraries";
import { ISharedTreeView } from "../../../shared-tree";
import { brand } from "../../../util";
import { SummarizeType, TestTreeProvider, initializeTestTree, viewWithContent } from "../../utils";
import { AllowedUpdateType } from "../../../core";

const builder = new SchemaBuilder("node key index tests", {}, nodeKeySchema);
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
	function createView(
		initialTree: SchemaAware.TypedField<
			typeof nodeSchemaData.rootFieldSchema,
			SchemaAware.ApiMode.Simple
		>,
	): ISharedTreeView {
		return viewWithContent(
			{ initialTree, schema: nodeSchemaData },
			{ nodeKeyManager: createMockNodeKeyManager() },
		);
	}

	function assertIds(tree: ISharedTreeView, ids: LocalNodeKey[]): void {
		assert.equal(tree.nodeKey.map.size, ids.length);
		for (const id of ids) {
			assert(tree.nodeKey.map.has(id));
			const node = tree.nodeKey.map.get(id);
			assert(node !== undefined);
			assert.equal(node[localNodeKeySymbol], id);
		}
		assert.deepEqual(new Set(tree.nodeKey.map.keys()), new Set(ids));
	}

	it("can look up a node that was inserted", () => {
		const view = createView(undefined);
		const key = view.nodeKey.generate();
		view.setContent({
			child: undefined,
			...contextualizeKey(view, key),
		});
		assertIds(view, [key]);
	});

	it("can look up multiple nodes that were inserted at once", () => {
		const view = createView(undefined);
		const keys = [view.nodeKey.generate(), view.nodeKey.generate(), view.nodeKey.generate()];
		view.setContent({
			...contextualizeKey(view, keys[0]),
			child: {
				...contextualizeKey(view, keys[1]),
				child: {
					...contextualizeKey(view, keys[2]),
					child: undefined,
				},
			},
		});
		assertIds(view, keys);
	});

	it("can look up multiple nodes that were inserted over time", () => {
		const view = createView(undefined);
		const keyA = view.nodeKey.generate();
		view.setContent({
			...contextualizeKey(view, keyA),
			child: undefined,
		});

		const node = view.nodeKey.map.get(keyA);
		assert(node !== undefined);
		const keyB = view.nodeKey.generate();
		node[setField](brand("child"), { ...contextualizeKey(view, keyB) });
		assertIds(view, [keyA, keyB]);
	});

	it("forgets about nodes that are deleted", () => {
		const view = createView(undefined);
		view.setContent({
			...contextualizeKey(view, view.nodeKey.generate()),
			child: undefined,
		});
		view.setContent(undefined);
		assertIds(view, []);
	});

	it("fails if multiple nodes have the same key", () => {
		const view = createView(undefined);
		const key = view.nodeKey.generate();
		assert.throws(
			() =>
				view.setContent({
					...contextualizeKey(view, key),
					child: {
						...contextualizeKey(view, key),
						child: undefined,
					},
				}),
			(e: Error) => validateAssertionError(e, "Encountered duplicate node key"),
		);
	});

	it("can look up a node that was loaded from summary", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [tree] = provider.trees;
		const key = tree.view.nodeKey.generate();
		tree.schematize({
			initialTree: {
				...contextualizeKey(tree.view, key),
				child: undefined,
			},
			schema: nodeSchemaData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});
		await provider.ensureSynchronized();

		await provider.summarize();
		const tree2 = await provider.createTree();
		await provider.ensureSynchronized();
		assertIds(tree2.view, [tree2.view.nodeKey.localize(tree.view.nodeKey.stabilize(key))]);
	});

	it("errors on nodes which have keys of the wrong type", () => {
		assert.throws(
			() =>
				initializeTestTree(
					createView(undefined),
					{
						type: nodeSchema.name,
						fields: {
							[nodeKeyFieldKey]: [{ type: nodeKeyTreeSchema.name, value: 5 }],
						},
					},
					nodeSchemaData,
				),
			(e: Error) =>
				validateAssertionError(e, "Malformed value encountered in node key field"),
		);
	});

	it("errors on nodes which should have keys, but do not", () => {
		const view = createView(undefined);
		assert.throws(
			() =>
				view.setContent(
					// Wrong type: should need ts-expect-error once strongly typed.
					{
						child: undefined,
					},
				),
			(e: Error) => validateAssertionError(e, "Node key absent but required by schema"),
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

		// TODO: avoid double initialization
		const view = createView(undefined);
		initializeTestTree(
			view,
			{
				type: nodeSchema.name,
				fields: {
					[nodeKeyFieldKey]: [
						{
							type: nodeKeyTreeSchema.name,
							value: view.nodeKey.generate() as unknown as number,
						},
					],
				},
			},
			nodeSchemaDataNoKey,
		);
		assertIds(view, []);
		assert(!NodeKeyIndex.hasNodeKeyTreeSchema(view.context.schema));
	});

	it("is synchronized after each batch update", () => {
		const view = createView(undefined);
		const key = view.nodeKey.generate();
		let expectedIds: LocalNodeKey[] = [key];
		let batches = 0;
		view.events.on("afterBatch", () => {
			assertIds(view, expectedIds);
			batches += 1;
		});

		view.setContent({
			...contextualizeKey(view, key),
			child: undefined,
		});

		expectedIds = [];
		view.setContent(undefined);
		assert.equal(batches, 2);
	});

	// TODO: Schema changes are not yet fully hooked up to eventing. A schema change should probably trigger
	it.skip("reacts to schema changes", () => {
		// This is missing the global node key field on the node
		const builder2 = new SchemaBuilder("node key index test", {}, nodeKeySchema);
		const nodeSchemaNoKey = builder2.structRecursive("node", {
			child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchemaNoKey),
		});
		const nodeSchemaDataNoKey = builder2.intoDocumentSchema(
			SchemaBuilder.fieldOptional(nodeSchemaNoKey),
		);

		const view = createView(undefined);
		const key = view.nodeKey.generate();
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
				const key = view.nodeKey.generate();
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
				const key = view.nodeKey.generate();
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
});
