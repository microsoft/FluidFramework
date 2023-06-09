/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { TestTreeProviderLite, initializeTestTree } from "../utils";
import { brand, useDeterministicStableId } from "../../util";
import { FieldKey, UpPath } from "../../core";
import { ISharedTree, ISharedTreeView } from "../../shared-tree";
import { singleTextCursor } from "../../feature-libraries";
import { createSnapshot, verifyEqualPastSnapshot } from "./utils";

const regenerateSnapshots = false;

const dirPathTail = "src/test/snapshots/files";
const fieldKeyA: FieldKey = brand("FieldA");
const fieldKeyB: FieldKey = brand("FieldB");
const fieldKeyC: FieldKey = brand("FieldC");

function generateTree(fields: FieldKey[], height: number, nodesPerField: number): ISharedTree {
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
	if (regenerateSnapshots) {
		it("regenerate", async () => {
			const summary = await generateSummary();
			await createSnapshot(filePath, summary);
		});
	} else {
		it("is equal to previous one", async () => {
			const summary = await generateSummary();
			await verifyEqualPastSnapshot(filePath, summary);
		});
	}
});
