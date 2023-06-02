/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import path from "path";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
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
import { ISharedTree, ISharedTreeView } from "../../shared-tree";
import { singleTextCursor, FieldKinds, namedTreeSchema } from "../../feature-libraries";
import { createSnapshot, isEqualPastSnapshot } from "./utils";

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

async function generateSummary(): Promise<ISummaryTreeWithStats> {
	const tree = useDeterministicStableId(() =>
		generateTree([fieldKeyA, fieldKeyB, fieldKeyC], 2, 3),
	);
	return tree.summarize(true);
}

describe("Summary snapshot", () => {
	let filePath: string;
	before(() => {
		const dirPath = path.join(__dirname, `../../../${dirPathTail}`);
		filePath = `${dirPath}/summary_snapshot.json`;
	});

	// Only run this test when you want to regenerate the snapshot.
	it.skip("regenerate", async () => {
		const summary = await generateSummary();
		await createSnapshot(filePath, summary);
	});

	it("is equal to previous one", async () => {
		const summary = await generateSummary();
		assert(await isEqualPastSnapshot(filePath, summary));
	});
});
