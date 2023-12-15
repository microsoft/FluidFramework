/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { brand } from "../../util";
import {
	ISharedTree,
	ITreeCheckout,
	InitializeAndSchematizeConfiguration,
	SharedTreeFactory,
	runSynchronous,
} from "../../shared-tree";
import {
	Any,
	FieldKinds,
	TreeFieldSchema,
	TreeCompressionStrategy,
	cursorForJsonableTreeNode,
	cursorForTypedTreeData,
	TreeNodeSchema,
	InsertableFlexNode,
	intoStoredSchema,
} from "../../feature-libraries";
import { typeboxValidator } from "../../external-utilities";
import {
	TestTreeProviderLite,
	emptyJsonSequenceConfig,
	expectJsonTree,
	insert,
	jsonSequenceRootSchema,
	remove,
	wrongSchema,
} from "../utils";
import {
	AllowedUpdateType,
	FieldKey,
	FieldUpPath,
	ITreeCursorSynchronous,
	JsonableTree,
	UpPath,
	rootFieldKey,
} from "../../core";
import { leaf, SchemaBuilder } from "../../domains";

const rootField: FieldUpPath = { parent: undefined, field: rootFieldKey };
const rootNode: UpPath = {
	parent: undefined,
	parentField: rootFieldKey,
	parentIndex: 0,
};

const factory = new SharedTreeFactory({
	jsonValidator: typeboxValidator,
	summaryEncodeType: TreeCompressionStrategy.Uncompressed,
});

const builder = new SchemaBuilder({ scope: "test trees" });
const rootNodeSchema = builder.map("TestInner", SchemaBuilder.sequence(Any));
const testSchema = builder.intoSchema(SchemaBuilder.sequence(Any));

function generateCompleteTree(
	fields: FieldKey[],
	height: number,
	nodesPerField: number,
): ISharedTree {
	const tree = factory.create(
		new MockFluidDataStoreRuntime({ clientId: "test-client", id: "test" }),
		"test",
	);
	const view = tree.schematizeInternal({
		allowedSchemaModifications: AllowedUpdateType.None,
		schema: testSchema,
		initialTree: [],
	}).checkout;
	generateTreeRecursively(view, undefined, fields, height, nodesPerField, { value: 1 });
	return tree;
}

function generateTreeRecursively(
	tree: ITreeCheckout,
	parent: UpPath | undefined,
	fieldKeys: FieldKey[],
	height: number,
	nodesPerField: number,
	currentValue: { value: number },
): void {
	if (height === 0) {
		return;
	}

	for (const fieldKey of fieldKeys) {
		const fieldUpPath = {
			parent,
			field: fieldKey,
		};
		const field = tree.editor.sequenceField(fieldUpPath);

		for (let i = 0; i < nodesPerField; i++) {
			if (height === 1) {
				const writeCursor = cursorForJsonableTreeNode({
					type: leaf.string.name,
					value: currentValue.value.toString(),
				});
				field.insert(i, writeCursor);
				currentValue.value++;
			} else {
				const writeCursor = cursorForJsonableTreeNode({
					type: rootNodeSchema.name,
				});
				field.insert(i, writeCursor);

				generateTreeRecursively(
					tree,
					{ parent, parentField: fieldKey, parentIndex: i },
					fieldKeys,
					height - 1,
					nodesPerField,
					currentValue,
				);
			}
		}
	}
}

// TODO: The generated test trees should eventually be updated to use the chunked-forest.
export function generateTestTrees() {
	const testTrees: {
		only?: boolean;
		skip?: boolean;
		name: string;
		runScenario: (
			takeSnapshot: (tree: ISharedTree, name: string) => Promise<void>,
		) => Promise<void>;
	}[] = [
		{
			name: "move-across-fields",
			runScenario: async (takeSnapshot) => {
				const provider = new TestTreeProviderLite(2);
				const tree1 = provider.trees[0].view;
				const tree2 = provider.trees[1].view;

				// NOTE: we're using the old tree editing APIs here as the new
				// editable-tree-2 API doesn't support cross-field moves at the
				// time of writing
				const initialState: JsonableTree = {
					type: brand("Node"),
					fields: {
						foo: [
							{ type: brand("Node"), value: "a" },
							{ type: brand("Node"), value: "b" },
							{ type: brand("Node"), value: "c" },
						],
						bar: [
							{ type: brand("Node"), value: "d" },
							{ type: brand("Node"), value: "e" },
							{ type: brand("Node"), value: "f" },
						],
					},
				};

				tree1.storedSchema.update(intoStoredSchema(wrongSchema));

				// Apply an edit to the tree which inserts a node with a value
				runSynchronous(tree1, () => {
					const writeCursors = cursorForJsonableTreeNode(initialState);
					const field = tree1.editor.sequenceField({
						parent: undefined,
						field: rootFieldKey,
					});
					field.insert(0, writeCursors);
				});

				runSynchronous(tree1, () => {
					const rootPath = {
						parent: undefined,
						parentField: rootFieldKey,
						parentIndex: 0,
					};
					tree1.editor.move(
						{ parent: rootPath, field: brand("foo") },
						1,
						2,
						{ parent: rootPath, field: brand("bar") },
						1,
					);
				});

				provider.processMessages();

				await takeSnapshot(provider.trees[0], "tree-0-final");
			},
		},
		{
			name: "insert-and-delete",
			runScenario: async (takeSnapshot) => {
				const value = "42";
				const provider = new TestTreeProviderLite(2);
				const tree1 = provider.trees[0].schematizeInternal(emptyJsonSequenceConfig);
				provider.processMessages();
				const tree2 =
					provider.trees[1].schematizeInternal(emptyJsonSequenceConfig).checkout;
				provider.processMessages();

				// Insert node
				tree1.editableTree.insertAtStart([value]);
				provider.processMessages();

				await takeSnapshot(provider.trees[0], "tree-0-after-insert");

				// Delete node
				tree1.editableTree.removeAt(0);

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
				const innerBuilder = new SchemaBuilder({
					scope: "optional-field",
					libraries: [leaf.library],
				});
				const testNode = innerBuilder.map("TestNode", leaf.all);
				const docSchema = innerBuilder.intoSchema(SchemaBuilder.optional(testNode));

				const config = {
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: docSchema,
					initialTree: undefined,
				} as const;

				// Enables below editing code to be slightly less verbose
				const makeCursor = <T extends TreeNodeSchema>(
					schema: T,
					data: InsertableFlexNode<T>,
				): ITreeCursorSynchronous =>
					cursorForTypedTreeData({ schema: docSchema }, schema, data);

				const provider = new TestTreeProviderLite(2);
				const tree = provider.trees[0].schematizeInternal(config);
				const view = tree.checkout;
				view.editor.optionalField(rootField).set(makeCursor(testNode, {}), true);
				provider.processMessages();
				const view2 = provider.trees[1].schematizeInternal(config).checkout;

				view2.editor
					.optionalField({ parent: rootNode, field: brand("root 1 child") })
					.set(makeCursor(leaf.number, 40), true);
				view2.editor
					.optionalField(rootField)
					.set(makeCursor(testNode, { "root 2 child": 41 }), false);

				// Transaction with a root and child change
				runSynchronous(view, () => {
					view.editor
						.optionalField({ parent: rootNode, field: brand("root 1 child") })
						.set(makeCursor(leaf.number, 42), true);
					view.editor.optionalField(rootField).set(makeCursor(testNode, {}), false);
					view.editor
						.optionalField({ parent: rootNode, field: brand("root 3 child") })
						.set(makeCursor(leaf.number, 43), true);
				});

				view.editor
					.optionalField({ parent: rootNode, field: brand("root 3 child") })
					.set(cursorForTypedTreeData({ schema: docSchema }, leaf.number, 44), false);

				provider.processMessages();

				// EditManager snapshot should involve information about rebasing tree1's edits (a transaction with root & child changes)
				// over tree2's edits (a root change and a child change outside of the transaction).
				await takeSnapshot(provider.trees[0], "final");
			},
		},
		{
			name: "competing-deletes",
			runScenario: async (takeSnapshot) => {
				for (const index of [0, 1, 2, 3]) {
					const provider = new TestTreeProviderLite(4);
					const config: InitializeAndSchematizeConfiguration = {
						schema: jsonSequenceRootSchema,
						initialTree: [0, 1, 2, 3],
						allowedSchemaModifications: AllowedUpdateType.None,
					};
					const tree1 = provider.trees[0].schematizeInternal(config).checkout;
					provider.processMessages();
					const tree2 = provider.trees[1].schematizeInternal(config).checkout;
					const tree3 = provider.trees[2].schematizeInternal(config).checkout;
					const tree4 = provider.trees[3].schematizeInternal(config).checkout;
					provider.processMessages();
					remove(tree1, index, 1);
					remove(tree2, index, 1);
					remove(tree3, index, 1);
					provider.processMessages();
					await takeSnapshot(provider.trees[0], `index-${index}`);
				}
			},
		},
		{
			name: "concurrent-inserts",
			runScenario: async (takeSnapshot) => {
				const baseTree = factory.create(
					new MockFluidDataStoreRuntime({ clientId: "test-client", id: "test" }),
					"test",
				);

				const tree1 = baseTree.schematizeInternal({
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: jsonSequenceRootSchema,
					initialTree: [],
				}).checkout;

				const tree2 = tree1.fork();
				insert(tree1, 0, "y");
				tree2.rebaseOnto(tree1);

				insert(tree1, 0, "x");
				insert(tree2, 1, "a", "c");
				insert(tree2, 2, "b");
				tree2.rebaseOnto(tree1);
				tree1.merge(tree2);

				await takeSnapshot(baseTree, "tree2");

				const expected = ["x", "y", "a", "b", "c"];
				expectJsonTree([tree1, tree2], expected);

				const tree3 = tree1.fork();
				insert(tree1, 0, "z");
				insert(tree3, 1, "d", "e");
				insert(tree3, 2, "f");
				tree3.rebaseOnto(tree1);
				tree1.merge(tree3);

				await takeSnapshot(baseTree, "tree3");
			},
		},
		{
			name: "complete-3x3",
			runScenario: async (takeSnapshot) => {
				const fieldKeyA: FieldKey = brand("FieldA");
				const fieldKeyB: FieldKey = brand("FieldB");
				const fieldKeyC: FieldKey = brand("FieldC");
				await takeSnapshot(
					generateCompleteTree([fieldKeyA, fieldKeyB, fieldKeyC], 2, 3),
					"final",
				);
			},
		},
		{
			name: "has-handle",
			runScenario: async (takeSnapshot) => {
				const innerBuilder = new SchemaBuilder({
					scope: "has-handle",
					libraries: [leaf.library],
				});
				const docSchema = innerBuilder.intoSchema(SchemaBuilder.optional(leaf.handle));

				const config = {
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: docSchema,
					initialTree: undefined,
				};
				const tree = factory.create(
					new MockFluidDataStoreRuntime({ clientId: "test-client", id: "test" }),
					"test",
				);
				const view = tree.schematizeInternal(config).checkout;

				const field = view.editor.optionalField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.set(
					cursorForJsonableTreeNode({ type: leaf.handle.name, value: tree.handle }),
					true,
				);
				await takeSnapshot(tree, "final");
			},
		},
		{
			name: "nested-sequence-change",
			runScenario: async (takeSnapshot) => {
				const innerBuilder = new SchemaBuilder({
					scope: "has-sequence-map",
				});
				const seqMapSchema = innerBuilder.mapRecursive(
					"SeqMap",
					TreeFieldSchema.createUnsafe(FieldKinds.sequence, [() => seqMapSchema]),
				);
				const docSchema = innerBuilder.intoSchema(SchemaBuilder.sequence(seqMapSchema));

				const config = {
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: docSchema,
					initialTree: [],
				};

				const tree = factory.create(
					new MockFluidDataStoreRuntime({ clientId: "test-client", id: "test" }),
					"test",
				);
				const view = tree.schematizeInternal(config).checkout;
				view.transaction.start();
				// We must make this shallow change to the sequence field as part of the same transaction as the
				// nested change. Otherwise, the nested change will be represented using the generic field kind.
				view.editor
					.sequenceField({
						parent: undefined,
						field: rootFieldKey,
					})
					.insert(0, [cursorForJsonableTreeNode({ type: seqMapSchema.name })]);
				// The nested change
				view.editor
					.sequenceField({
						parent: {
							parent: undefined,
							parentField: rootFieldKey,
							parentIndex: 0,
						},
						field: brand("foo"),
					})
					.insert(0, [cursorForJsonableTreeNode({ type: seqMapSchema.name })]);
				view.transaction.commit();
				await takeSnapshot(tree, "final");
			},
		},
		{
			name: "empty-root",
			runScenario: async (takeSnapshot) => {
				await takeSnapshot(generateCompleteTree([], 0, 0), "final");
			},
		},
	];

	return testTrees;
}
