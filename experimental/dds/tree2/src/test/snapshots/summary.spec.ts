/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import path from "path";
import { createSnapshotAsync, isEqualPastSnapshotAsync } from "@fluid-internal/test-dds-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { TestTreeProviderLite } from "../utils";
import { brand, useDeterministicStableId } from "../../util";
import {
	FieldKey,
	UpPath,
	rootFieldKey,
	fieldSchema,
	GlobalFieldKey,
	SchemaData,
} from "../../core";
import { ISharedTree, runSynchronous } from "../../shared-tree";
import { singleTextCursor, FieldKinds, namedTreeSchema } from "../../feature-libraries";

const dirPathTail = "src/test/snapshots/files";
const fieldKeyA: FieldKey = brand("FieldA");
const fieldKeyB: FieldKey = brand("FieldB");
const fieldKeyC: FieldKey = brand("FieldC");

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");
const rootFieldSchema = fieldSchema(FieldKinds.value);
const globalFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
	name: brand("TestValue"),
	extraLocalFields: fieldSchema(FieldKinds.sequence),
	globalFields: [globalFieldKey],
});
const testSchema: SchemaData = {
	treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
	globalFieldSchema: new Map([
		[rootFieldKey, rootFieldSchema],
		[globalFieldKey, globalFieldSchema],
	]),
};

function generateTree(fields: FieldKey[], height: number, nodesPerField: number): ISharedTree {
	const provider = new TestTreeProviderLite();
	const tree = provider.trees[0];
	tree.storedSchema.update(testSchema);
	generateTreeRecursively(tree, undefined, fields, height, nodesPerField, 1);
	provider.processMessages();
	return tree;
}

function generateTreeRecursively(
	tree: ISharedTree,
	parent: UpPath | undefined,
	fieldKeys: FieldKey[],
	height: number,
	nodesPerField: number,
	currentValue: number,
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
			runSynchronous(tree, () => {
				const writeCursor = singleTextCursor({
					type: brand("TestValue"),
					value: currentValue.toString,
				});
				field.insert(i, writeCursor);
			});

			generateTreeRecursively(
				tree,
				{ parent, parentField: fieldKey, parentIndex: i },
				fieldKeys,
				height - 1,
				nodesPerField,
				currentValue,
			);

			// This value could be calculated, but it's more readable to just increment it.
			// eslint-disable-next-line no-param-reassign
			currentValue++;
		}
	}
}

function generateSummary(): ISummaryTree {
	let summary: ISummaryTree | undefined;
	useDeterministicStableId(() => {
		const tree = generateTree([fieldKeyA, fieldKeyB, fieldKeyC], 2, 2);
		({ summary } = tree.getAttachSummary(true));
	});
	assert(summary !== undefined);
	return summary;
}

describe("Summary snapshot", () => {
	let filePath: string;
	before(() => {
		const dirPath = path.join(__dirname, `../../../${dirPathTail}`);
		filePath = `${dirPath}/summary_snapshot.json`;
	});

	// Only run this test when you want to regenerate the snapshot.
	it.skip("regenerate", async () => {
		const summary = generateSummary();
		await createSnapshotAsync(filePath, summary);
	});

	it("is equal to previous one", async () => {
		const summary = generateSummary();
		assert(await isEqualPastSnapshotAsync(filePath, summary));
	});
});
