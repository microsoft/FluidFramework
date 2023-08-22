/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { brand, useDeterministicStableId } from "../../util";
import { AllowedUpdateType, FieldKey, UpPath, ValueSchema, rootFieldKey } from "../../core";
import { ISharedTree, ISharedTreeView, SharedTreeFactory } from "../../shared-tree";
import { Any, FieldKinds, SchemaBuilder, singleTextCursor } from "../../feature-libraries";
import { typeboxValidator } from "../../external-utilities";

const factory = new SharedTreeFactory({ jsonValidator: typeboxValidator });

const builder = new SchemaBuilder("test trees");
const rootNodeSchema = builder.map("TestInner", SchemaBuilder.fieldSequence(Any));
const leafNodeSchema = builder.leaf("TestLeaf", ValueSchema.String);
const testSchema = builder.intoDocumentSchema(SchemaBuilder.fieldSequence(Any));

function generateCompleteTree(
	fields: FieldKey[],
	height: number,
	nodesPerField: number,
): ISharedTree {
	const tree = factory.create(
		new MockFluidDataStoreRuntime({ clientId: "test-client", id: "test" }),
		"test",
	);
	tree.schematize({
		allowedSchemaModifications: AllowedUpdateType.None,
		schema: testSchema,
		initialTree: [],
	});
	generateTreeRecursively(tree, undefined, fields, height, nodesPerField, { value: 1 });
	return tree;
}

function generateTreeRecursively(
	tree: ISharedTreeView,
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
				const writeCursor = singleTextCursor({
					type: leafNodeSchema.name,
					value: currentValue.toString,
				});
				field.insert(i, writeCursor);
				currentValue.value++;
			} else {
				const writeCursor = singleTextCursor({
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

// TODO:
// The implementation and usage of these implies the edit history of these trees is relevant, but its not exactly clear how.
// More documentation on what kind of coverage over possible tree histories and contents this is supposed to provide is needed here.
// Depending on the above, maybe these tests (or at least some of the cases) should probably be changed to use branches and not full trees to avoid depending on a Fluid runtime.
// Currently these tests all replicate pre-attachment states.
// Coverage for other states should be added (including cases with collaboration).
export function generateTestTrees(): { name: string; tree: () => ISharedTree }[] {
	return [
		{
			name: "complete-3x3",
			tree: () => {
				const fieldKeyA: FieldKey = brand("FieldA");
				const fieldKeyB: FieldKey = brand("FieldB");
				const fieldKeyC: FieldKey = brand("FieldC");
				return generateCompleteTree([fieldKeyA, fieldKeyB, fieldKeyC], 2, 3);
			},
		},
		{
			name: "has-handle",
			tree: () => {
				const innerBuilder = new SchemaBuilder("has-handle");
				const handleSchema = innerBuilder.leaf("Handle", ValueSchema.Serializable);
				const docSchema = innerBuilder.intoDocumentSchema(
					SchemaBuilder.fieldOptional(handleSchema),
				);

				const config = {
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: docSchema,
					initialTree: undefined,
				};
				const tree = factory.create(
					new MockFluidDataStoreRuntime({ clientId: "test-client", id: "test" }),
					"test",
				);
				tree.schematize(config);

				const field = tree.editor.optionalField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.set(singleTextCursor({ type: handleSchema.name, value: tree.handle }), true);
				return tree;
			},
		},
		{
			name: "nested-sequence-change",
			tree: () => {
				const innerBuilder = new SchemaBuilder("has-sequence-map");
				const seqMapSchema = innerBuilder.mapRecursive(
					"SeqMap",
					SchemaBuilder.fieldRecursive(FieldKinds.sequence, () => seqMapSchema),
				);
				const docSchema = innerBuilder.intoDocumentSchema(
					SchemaBuilder.fieldSequence(seqMapSchema),
				);

				const config = {
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: docSchema,
					initialTree: [],
				};

				const tree = factory.create(
					new MockFluidDataStoreRuntime({ clientId: "test-client", id: "test" }),
					"test",
				);
				tree.schematize(config);

				tree.storedSchema.update(docSchema);
				tree.transaction.start();
				// We must make this shallow change to the sequence field as part of the same transaction as the
				// nested change. Otherwise, the nested change will be represented using the generic field kind.
				tree.editor
					.sequenceField({
						parent: undefined,
						field: rootFieldKey,
					})
					.insert(0, [singleTextCursor({ type: brand("SeqMap") })]);
				// The nested change
				tree.editor
					.sequenceField({
						parent: {
							parent: undefined,
							parentField: rootFieldKey,
							parentIndex: 0,
						},
						field: brand("foo"),
					})
					.insert(0, [singleTextCursor({ type: brand("SeqMap") })]);
				tree.transaction.commit();
				return tree;
			},
		},
	].map(({ name, tree }) => ({ name, tree: () => useDeterministicStableId(tree) }));
}
