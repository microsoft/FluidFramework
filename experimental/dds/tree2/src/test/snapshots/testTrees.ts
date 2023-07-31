/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTreeTestFactory, TestTreeProviderLite, initializeTestTree } from "../utils";
import { brand, useDeterministicStableId } from "../../util";
import { FieldKey, UpPath, ValueSchema, rootFieldKey } from "../../core";
import { ISharedTree, ISharedTreeView } from "../../shared-tree";
import { SchemaBuilder, singleTextCursor } from "../../feature-libraries";

const fieldKeyA: FieldKey = brand("FieldA");
const fieldKeyB: FieldKey = brand("FieldB");
const fieldKeyC: FieldKey = brand("FieldC");

function generateCompleteTree(
	fields: FieldKey[],
	height: number,
	nodesPerField: number,
): ISharedTree {
	const provider = new TestTreeProviderLite();
	const tree = provider.trees[0];
	initializeTestTree(tree);
	generateTreeRecursively(tree, undefined, fields, height, nodesPerField, { value: 1 });
	provider.processMessages();
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
			const writeCursor = singleTextCursor({
				type: brand("TestValue"),
				value: currentValue.toString,
			});
			field.insert(i, writeCursor);

			currentValue.value++;

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

export function generateTestTrees(): { name: string; tree: ISharedTree }[] {
	return [
		{
			name: "complete-3x3",
			tree: () => generateCompleteTree([fieldKeyA, fieldKeyB, fieldKeyC], 2, 3),
		},
		{
			name: "has-handle",
			tree: () => {
				const builder = new SchemaBuilder("has-handle");
				const handleSchema = builder.leaf("Handle", ValueSchema.Serializable);
				const docSchema = builder.intoDocumentSchema(
					SchemaBuilder.fieldOptional(handleSchema),
				);
				const onCreate = (tree: ISharedTree) => {
					tree.storedSchema.update(docSchema);
					const field = tree.editor.optionalField({
						parent: undefined,
						field: rootFieldKey,
					});
					field.set(
						singleTextCursor({ type: handleSchema.name, value: tree.handle }),
						true,
					);
				};

				const provider = new TestTreeProviderLite(1, new SharedTreeTestFactory(onCreate));
				return provider.trees[0];
			},
		},
	].map(({ name, tree }) => ({ name, tree: useDeterministicStableId(tree) }));
}
