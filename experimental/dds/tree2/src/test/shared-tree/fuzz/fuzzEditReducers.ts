/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { combineReducersAsync } from "@fluid-internal/stochastic-test-utils";
import { DDSFuzzTestState } from "@fluid-internal/test-dds-utils";
import { singleTextCursor } from "../../../feature-libraries";
import { brand, fail } from "../../../util";
import { toJsonableTree } from "../../utils";
import { ISharedTree, SharedTreeFactory } from "../../../shared-tree";
import { FieldUpPath } from "../../../core";
import {
	FieldEdit,
	FuzzDelete,
	FuzzFieldChange,
	FuzzTransactionType,
	Operation,
} from "./operationTypes";

export const fuzzReducer = combineReducersAsync<Operation, DDSFuzzTestState<SharedTreeFactory>>({
	edit: async (state, operation) => {
		const { contents } = operation;
		switch (contents.type) {
			case "fieldEdit": {
				const tree = state.channel;
				applyFieldEdit(tree, contents);
				break;
			}
			default:
				break;
		}
		return state;
	},
	transaction: async (state, operation) => {
		const { contents } = operation;
		const tree = state.channel;
		applyTransactionEdit(tree, contents);
		return state;
	},
});

export function checkTreesAreSynchronized(trees: readonly ISharedTree[]) {
	const lastTree = toJsonableTree(trees[trees.length - 1]);
	for (let i = 0; i < trees.length - 1; i++) {
		const actual = toJsonableTree(trees[i]);
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
		case "value":
			applyValueFieldEdit(tree, fieldEdit.change.edit);
			break;
		case "optional":
			applyOptionalFieldEdit(tree, fieldEdit.change.edit);
			break;
		default:
			break;
	}
}

function applySequenceFieldEdit(tree: ISharedTree, change: FuzzFieldChange): void {
	switch (change.type) {
		case "insert": {
			const field = tree.editor.sequenceField({ parent: change.parent, field: change.field });
			field.insert(
				change.index,
				singleTextCursor({ type: brand("Test"), value: change.value }),
			);
			break;
		}
		case "delete": {
			const field = tree.editor.sequenceField({
				parent: change.firstNode?.parent,
				field: change.firstNode?.parentField,
			});
			field.delete(change.firstNode?.parentIndex, change.count);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyValueFieldEdit(tree: ISharedTree, change: FuzzDelete): void {
	const fieldPath: FieldUpPath = {
		parent: change.firstNode?.parent,
		field: change.firstNode?.parentField,
	};
	const field = tree.editor.sequenceField(fieldPath);
	field.delete(change.firstNode?.parentIndex, change.count);
}

function applyOptionalFieldEdit(tree: ISharedTree, change: FuzzFieldChange): void {
	switch (change.type) {
		case "insert": {
			const fieldPath: FieldUpPath = {
				parent: change.parent,
				field: change.field,
			};
			const field = tree.editor.optionalField(fieldPath);
			field.set(singleTextCursor({ type: brand("Test"), value: change.value }), false);
			break;
		}
		case "delete": {
			const fieldPath: FieldUpPath = {
				parent: change.firstNode?.parent,
				field: change.firstNode?.parentField,
			};
			const field = tree.editor.optionalField(fieldPath);
			field.set(undefined, true);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyTransactionEdit(tree: ISharedTree, contents: FuzzTransactionType): void {
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
