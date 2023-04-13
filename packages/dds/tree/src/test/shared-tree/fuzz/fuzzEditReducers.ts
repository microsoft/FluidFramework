/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AsyncReducer } from "@fluid-internal/stochastic-test-utils";
import { singleTextCursor } from "../../../feature-libraries";
import { brand, fail } from "../../../util";
import { ITestTreeProvider, toJsonableTree } from "../../utils";
import { ISharedTree } from "../../../shared-tree";
import {
	FuzzTransactionEdit,
	FuzzTestState,
	Operation,
	FuzzFieldChange,
	FuzzNodeEditChange,
	NodeEdit,
	FieldEdit,
} from "./fuzzEditGenerators";

export const fuzzReducer: {
	[K in Operation["type"]]: AsyncReducer<Extract<Operation, { type: K }>, FuzzTestState>;
} = {
	edit: async (state, operation) => {
		const { contents } = operation;
		switch (contents.editType) {
			case "fieldEdit": {
				const index = contents.change.edit.treeIndex;
				const tree = state.testTreeProvider.trees[index];
				applyFieldEdit(tree, contents);
				break;
			}
			case "nodeEdit": {
				const change = operation.contents as NodeEdit;
				const index = change.edit.treeIndex;
				const tree = state.testTreeProvider.trees[index];
				applyNodeEdit(tree, change.edit);
				break;
			}
			default:
				break;
		}
		return state;
	},
	synchronize: async (state) => {
		const { testTreeProvider } = state;
		await testTreeProvider.ensureSynchronized();
		checkTreesAreSynchronized(testTreeProvider);
		return state;
	},
	transaction: async (state, operation) => {
		const { contents, treeIndex } = operation;
		const tree = state.testTreeProvider.trees[treeIndex];
		applyTransactionEdit(tree, contents);
		return state;
	},
};

export function checkTreesAreSynchronized(provider: ITestTreeProvider) {
	const lastTree = toJsonableTree(provider.trees[provider.trees.length - 1]);
	for (let i = 0; i < provider.trees.length - 1; i++) {
		const actual = toJsonableTree(provider.trees[i]);
		// Uncomment to get a merged view of the trees
		// const mergedView = merge(actual, lastTree);
		assert.deepEqual(actual, lastTree);
	}
}

function applyFieldEdit(tree: ISharedTree, fieldEdit: FieldEdit): void {
	switch (fieldEdit.change.type) {
		case "sequence":
			applySequenceFieldEdit(tree, fieldEdit.change.edit);
			break;
		default:
			break;
	}
}

function applySequenceFieldEdit(tree: ISharedTree, change: FuzzFieldChange): void {
	switch (change.type) {
		case "insert": {
			const field = tree.editor.sequenceField(change.parent, change.field);
			field.insert(
				change.index,
				singleTextCursor({ type: brand("Test"), value: change.value }),
			);
			break;
		}
		case "delete": {
			const field = tree.editor.sequenceField(
				change.firstNode?.parent,
				change.firstNode?.parentField,
			);
			field.delete(change.firstNode?.parentIndex, change.count);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyNodeEdit(tree: ISharedTree, change: FuzzNodeEditChange): void {
	switch (change.nodeEditType) {
		case "setPayload": {
			tree.editor.setValue(change.path, change.value);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}
function applyTransactionEdit(tree: ISharedTree, contents: FuzzTransactionEdit): void {
	switch (contents.fuzzType) {
		case "transactionStart": {
			tree.transaction.start();
			break;
		}
		case "transactionCommit": {
			tree.transaction.commit();
			break;
		}
		case "transactionAbort": {
			tree.transaction.abort();
			break;
		}
		default:
			fail("Invalid edit.");
	}
}
