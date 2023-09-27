/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { combineReducersAsync } from "@fluid-internal/stochastic-test-utils";
import { DDSFuzzTestState } from "@fluid-internal/test-dds-utils";
import { singleTextCursor } from "../../../feature-libraries";
import { fail } from "../../../util";
import { validateTreeConsistency } from "../../utils";
import { ISharedTree, ISharedTreeView, SharedTreeFactory } from "../../../shared-tree";
import { FieldUpPath, TreeNavigationResult } from "../../../core";
import {
	FieldEdit,
	FuzzDelete,
	FuzzFieldChange,
	FuzzSet,
	FuzzTransactionType,
	FuzzUndoRedoType,
	Operation,
} from "./operationTypes";

export const fuzzReducer = combineReducersAsync<Operation, DDSFuzzTestState<SharedTreeFactory>>({
	edit: async (state, operation) => {
		const { contents } = operation;
		switch (contents.type) {
			case "fieldEdit": {
				const tree = state.client.channel;
				applyFieldEdit(tree.view, contents);
				break;
			}
			default:
				break;
		}
		return state;
	},
	transaction: async (state, operation) => {
		const { contents } = operation;
		const tree = state.client.channel;
		applyTransactionEdit(tree.view, contents);
		return state;
	},
	undoRedo: async (state, operation) => {
		const { contents } = operation;
		const tree = state.client.channel;
		applyUndoRedoEdit(tree.view, contents);
		return state;
	},
	synchronizeTrees: async (state) => {
		applySynchronizationOp(state);
		return state;
	},
});

export function checkTreesAreSynchronized(trees: readonly ISharedTree[]) {
	for (const tree of trees) {
		validateTreeConsistency(trees[0], tree);
	}
}

export function applySynchronizationOp(state: DDSFuzzTestState<SharedTreeFactory>) {
	state.containerRuntimeFactory.processAllMessages();
	const connectedClients = state.clients.filter((client) => client.containerRuntime.connected);
	if (connectedClients.length > 0) {
		const readonlyChannel = state.summarizerClient.channel;
		for (const { channel } of connectedClients) {
			validateTreeConsistency(channel, readonlyChannel);
		}
	}
}

export function applyFieldEdit(tree: ISharedTreeView, fieldEdit: FieldEdit): void {
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

function applySequenceFieldEdit(tree: ISharedTreeView, change: FuzzFieldChange): void {
	switch (change.type) {
		case "insert": {
			const field = tree.editor.sequenceField(change.fieldPath);
			field.insert(change.index, singleTextCursor(change.value));
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

function applyValueFieldEdit(tree: ISharedTreeView, change: FuzzSet): void {
	const field = tree.editor.valueField(change.fieldPath);
	field.set(singleTextCursor(change.value));
}

function applyOptionalFieldEdit(tree: ISharedTreeView, change: FuzzSet | FuzzDelete): void {
	switch (change.type) {
		case "set": {
			const field = tree.editor.optionalField(change.fieldPath);
			const { forest } = tree;
			const anchors = (forest as any).anchors;
			const cursor = forest.allocateCursor();
			let wasEmpty: boolean;
			if (change.fieldPath.parent === undefined) {
				const result = forest.tryMoveCursorToField(
					{ parent: undefined, fieldKey: change.fieldPath.field },
					cursor,
				);
				assert(result === TreeNavigationResult.Ok, "Should have successfully navigated");
				wasEmpty = cursor.getFieldLength() === 0;
			} else {
				const anchor = anchors.track(change.fieldPath.parent);
				const result = forest.tryMoveCursorToField(
					{ parent: anchor, fieldKey: change.fieldPath.field },
					cursor,
				);
				assert(result === TreeNavigationResult.Ok, "Should have successfully navigated");
				wasEmpty = cursor.getFieldLength() === 0;
				anchors.forget(anchor);
			}

			cursor.free();
			field.set(singleTextCursor(change.value), wasEmpty);
			break;
		}
		case "delete": {
			const fieldPath: FieldUpPath = {
				parent: change.firstNode?.parent,
				field: change.firstNode?.parentField,
			};
			const field = tree.editor.optionalField(fieldPath);
			// Note: we're assuming that the field is currently set.
			field.set(undefined, false);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

export function applyTransactionEdit(tree: ISharedTreeView, contents: FuzzTransactionType): void {
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

export function applyUndoRedoEdit(tree: ISharedTreeView, contents: FuzzUndoRedoType): void {
	switch (contents.type) {
		case "undo": {
			tree.undo();
			break;
		}
		case "redo": {
			tree.redo();
			break;
		}
		default:
			fail("Invalid edit.");
	}
}
