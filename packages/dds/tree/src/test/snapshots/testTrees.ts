/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

// eslint-disable-next-line import/no-internal-modules -- test import
import { createAlwaysFinalizedIdCompressor } from "@fluidframework/id-compressor/test/idCompressorTestUtilities";
import { brand } from "../../util/index.js";
import {
	ISharedTree,
	ITreeCheckout,
	InitializeAndSchematizeConfiguration,
	SharedTreeFactory,
	runSynchronous,
} from "../../shared-tree/index.js";
import {
	Any,
	FieldKinds,
	FlexFieldSchema,
	cursorForJsonableTreeNode,
	cursorForTypedTreeData,
	FlexTreeNodeSchema,
	InsertableFlexNode,
	intoStoredSchema,
	TreeCompressionStrategy,
} from "../../feature-libraries/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import {
	TestTreeProviderLite,
	emptyJsonSequenceConfig,
	expectJsonTree,
	insert,
	jsonSequenceRootSchema,
	remove,
	schematizeFlexTree,
	treeTestFactory,
} from "../utils.js";
import {
	AllowedUpdateType,
	FieldKey,
	FieldUpPath,
	ITreeCursorSynchronous,
	JsonableTree,
	UpPath,
	rootFieldKey,
} from "../../core/index.js";
import { leaf, SchemaBuilder } from "../../domains/index.js";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeOptions, defaultSharedTreeOptions } from "../../shared-tree/sharedTree.js";

// Session ids used for the created trees' IdCompressors must be deterministic.
// TestTreeProviderLite does this by default.
// Test trees which manually create their data store runtime must set up their trees'
// session ids explicitly.
export const snapshotSessionId = "beefbeef-beef-4000-8000-000000000001" as SessionId;

export function createSnapshotCompressor() {
	return createAlwaysFinalizedIdCompressor(snapshotSessionId);
}

const rootField: FieldUpPath = { parent: undefined, field: rootFieldKey };
const rootNode: UpPath = {
	parent: undefined,
	parentField: rootFieldKey,
	parentIndex: 0,
};

const builder = new SchemaBuilder({ scope: "test trees" });
const rootNodeSchema = builder.map("TestInner", SchemaBuilder.sequence(Any));
const testSchema = builder.intoSchema(SchemaBuilder.sequence(Any));

function generateCompleteTree(
	fields: FieldKey[],
	height: number,
	nodesPerField: number,
	options: SharedTreeOptions,
): ISharedTree {
	const tree = treeTestFactory({
		runtime: new MockFluidDataStoreRuntime({
			clientId: "test-client",
			id: "test",
			idCompressor: createSnapshotCompressor(),
		}),
		options,
	});
	const view = schematizeFlexTree(tree, {
		allowedSchemaModifications: AllowedUpdateType.Initialize,
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
export function generateTestTrees(useUncompressedEncode?: boolean) {
	const testEncodeType = useUncompressedEncode === true ? "uncompressed" : "default-compression";
	const factoryOptions = {
		jsonValidator: typeboxValidator,
		treeEncodeType:
			useUncompressedEncode === true
				? TreeCompressionStrategy.Uncompressed
				: defaultSharedTreeOptions.treeEncodeType,
	};
	const factory = new SharedTreeFactory(factoryOptions);
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
				const provider = new TestTreeProviderLite(2, factory);
				const tree1 = provider.trees[0].checkout;
				const tree2 = provider.trees[1].checkout;

				// NOTE: we're using the old tree editing APIs here as the new
				// flex-tree API doesn't support cross-field moves at the
				// time of writing

				const schemaBuilder = new SchemaBuilder({ scope: "move-across-fields" });
				const nodeSchema = schemaBuilder.object("Node", {
					foo: SchemaBuilder.sequence(leaf.string),
					bar: SchemaBuilder.sequence(leaf.string),
				});
				const rootFieldSchema = SchemaBuilder.required(nodeSchema);
				const schema = schemaBuilder.intoSchema(rootFieldSchema);
				const initialState: JsonableTree = {
					type: nodeSchema.name,
					fields: {
						foo: [
							{ type: leaf.string.name, value: "a" },
							{ type: leaf.string.name, value: "b" },
							{ type: leaf.string.name, value: "c" },
						],
						bar: [
							{ type: leaf.string.name, value: "d" },
							{ type: leaf.string.name, value: "e" },
							{ type: leaf.string.name, value: "f" },
						],
					},
				};

				tree1.updateSchema(intoStoredSchema(schema));

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

				await takeSnapshot(provider.trees[0], `tree-0-final-${testEncodeType}`);
			},
		},
		{
			name: "insert-and-remove",
			runScenario: async (takeSnapshot) => {
				const value = "42";
				const provider = new TestTreeProviderLite(2, factory);
				const tree1 = schematizeFlexTree(provider.trees[0], emptyJsonSequenceConfig);
				provider.processMessages();
				const tree2 = schematizeFlexTree(
					provider.trees[1],
					emptyJsonSequenceConfig,
				).checkout;
				provider.processMessages();

				// Insert node
				tree1.flexTree.insertAtStart([value]);
				provider.processMessages();

				await takeSnapshot(provider.trees[0], `tree-0-after-insert-${testEncodeType}`);

				// Remove node
				tree1.flexTree.removeAt(0);

				provider.processMessages();

				await takeSnapshot(provider.trees[0], `tree-0-final-${testEncodeType}`);
				await takeSnapshot(provider.trees[1], `tree-1-final-${testEncodeType}`);
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
					allowedSchemaModifications: AllowedUpdateType.Initialize,
					schema: docSchema,
					initialTree: undefined,
				} as const;

				// Enables below editing code to be slightly less verbose
				const makeCursor = <T extends FlexTreeNodeSchema>(
					schema: T,
					data: InsertableFlexNode<T>,
				): ITreeCursorSynchronous =>
					cursorForTypedTreeData({ schema: docSchema }, schema, data);

				const provider = new TestTreeProviderLite(2, factory);
				const tree = schematizeFlexTree(provider.trees[0], config);
				const view = tree.checkout;
				view.editor.optionalField(rootField).set(makeCursor(testNode, {}), true);
				provider.processMessages();
				const view2 = schematizeFlexTree(provider.trees[1], config).checkout;

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
				await takeSnapshot(provider.trees[0], `final-${testEncodeType}`);
			},
		},
		{
			name: "competing-removes",
			runScenario: async (takeSnapshot) => {
				for (const index of [0, 1, 2, 3]) {
					const provider = new TestTreeProviderLite(4, factory);
					const config: InitializeAndSchematizeConfiguration = {
						schema: jsonSequenceRootSchema,
						initialTree: [0, 1, 2, 3],
						allowedSchemaModifications: AllowedUpdateType.Initialize,
					};
					const tree1 = schematizeFlexTree(provider.trees[0], config).checkout;
					provider.processMessages();
					const tree2 = schematizeFlexTree(provider.trees[1], config).checkout;
					const tree3 = schematizeFlexTree(provider.trees[2], config).checkout;
					const tree4 = schematizeFlexTree(provider.trees[3], config).checkout;
					provider.processMessages();
					remove(tree1, index, 1);
					remove(tree2, index, 1);
					remove(tree3, index, 1);
					provider.processMessages();
					await takeSnapshot(provider.trees[0], `index-${index}-${testEncodeType}`);
				}
			},
		},
		{
			name: "concurrent-inserts",
			runScenario: async (takeSnapshot) => {
				const baseTree = treeTestFactory({
					runtime: new MockFluidDataStoreRuntime({
						clientId: "test-client",
						id: "test",
						idCompressor: createSnapshotCompressor(),
					}),
					options: factoryOptions,
				});

				const tree1 = schematizeFlexTree(baseTree, {
					allowedSchemaModifications: AllowedUpdateType.Initialize,
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

				await takeSnapshot(baseTree, `tree2-${testEncodeType}`);

				const expected = ["x", "y", "a", "b", "c"];
				expectJsonTree([tree1, tree2], expected);

				const tree3 = tree1.fork();
				insert(tree1, 0, "z");
				insert(tree3, 1, "d", "e");
				insert(tree3, 2, "f");
				tree3.rebaseOnto(tree1);
				tree1.merge(tree3);

				await takeSnapshot(baseTree, `tree3-${testEncodeType}`);
			},
		},
		{
			name: "complete-3x3",
			runScenario: async (takeSnapshot) => {
				const fieldKeyA: FieldKey = brand("FieldA");
				const fieldKeyB: FieldKey = brand("FieldB");
				const fieldKeyC: FieldKey = brand("FieldC");
				await takeSnapshot(
					generateCompleteTree([fieldKeyA, fieldKeyB, fieldKeyC], 2, 3, factoryOptions),
					`final-${testEncodeType}`,
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
					allowedSchemaModifications: AllowedUpdateType.Initialize,
					schema: docSchema,
					initialTree: undefined,
				};
				const tree = treeTestFactory({
					runtime: new MockFluidDataStoreRuntime({
						clientId: "test-client",
						id: "test",
						idCompressor: createSnapshotCompressor(),
					}),
					options: factoryOptions,
				});
				const view = schematizeFlexTree(tree, config).checkout;

				const field = view.editor.optionalField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.set(
					cursorForJsonableTreeNode({ type: leaf.handle.name, value: tree.handle }),
					true,
				);

				await takeSnapshot(tree, `final-${testEncodeType}`);
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
					FlexFieldSchema.createUnsafe(FieldKinds.sequence, [() => seqMapSchema]),
				);
				const docSchema = innerBuilder.intoSchema(SchemaBuilder.sequence(seqMapSchema));

				const config = {
					allowedSchemaModifications: AllowedUpdateType.Initialize,
					schema: docSchema,
					initialTree: [],
				};

				const tree = treeTestFactory({
					id: `test-${testEncodeType}`,
					runtime: new MockFluidDataStoreRuntime({
						clientId: "test-client",
						id: "test",
						idCompressor: createSnapshotCompressor(),
					}),
					options: factoryOptions,
				});

				const view = schematizeFlexTree(tree, config).checkout;
				view.transaction.start();
				// We must make this shallow change to the sequence field as part of the same transaction as the
				// nested change. Otherwise, the nested change will be represented using the generic field kind.
				view.editor
					.sequenceField({
						parent: undefined,
						field: rootFieldKey,
					})
					.insert(0, cursorForJsonableTreeNode({ type: seqMapSchema.name }));
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
					.insert(0, cursorForJsonableTreeNode({ type: seqMapSchema.name }));
				view.transaction.commit();
				await takeSnapshot(tree, `final-${testEncodeType}`);
			},
		},
		{
			name: "empty-root",
			runScenario: async (takeSnapshot) => {
				await takeSnapshot(
					generateCompleteTree([], 0, 0, factoryOptions),
					`final-${testEncodeType}`,
				);
			},
		},
	];

	return testTrees;
}
