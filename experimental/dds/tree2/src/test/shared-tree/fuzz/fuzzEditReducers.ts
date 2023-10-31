/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AsyncReducer, combineReducers } from "@fluid-internal/stochastic-test-utils";
import { DDSFuzzTestState } from "@fluid-internal/test-dds-utils";
import { DownPath, TreeField, TreeNode, singleTextCursor } from "../../../feature-libraries";
import { fail } from "../../../util";
import { validateTreeConsistency } from "../../utils";
import { ISharedTree, ISharedTreeView, SharedTreeFactory } from "../../../shared-tree";
import { Revertible } from "../../../core";
import {
	FieldEdit,
	FuzzDelete,
	FuzzFieldChange,
	FuzzSet,
	FuzzTransactionType,
	FuzzUndoRedoType,
	Operation,
} from "./operationTypes";
import {
	fuzzNode,
	fuzzViewFromTree,
	getEditableTree,
	isRevertibleSharedTreeView,
} from "./fuzzUtils";

const syncFuzzReducer = combineReducers<Operation, DDSFuzzTestState<SharedTreeFactory>>({
	edit: (state, operation) => {
		const { contents } = operation;
		switch (contents.type) {
			case "fieldEdit": {
				applyFieldEdit(fuzzViewFromTree(state.client.channel), contents);
				break;
			}
			default:
				break;
		}
	},
	transaction: (state, operation) => {
		applyTransactionEdit(fuzzViewFromTree(state.client.channel), operation.contents);
	},
	undoRedo: (state, operation) => {
		const view = fuzzViewFromTree(state.client.channel);
		assert(isRevertibleSharedTreeView(view));
		applyUndoRedoEdit(view.undoStack, view.redoStack, operation.contents);
	},
	synchronizeTrees: (state) => {
		applySynchronizationOp(state);
	},
});
export const fuzzReducer: AsyncReducer<Operation, DDSFuzzTestState<SharedTreeFactory>> = async (
	state,
	operation,
) => syncFuzzReducer(state, operation);

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
		case "required":
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
			assert(change.parent !== undefined, "Sequence change should not occur at the root.");

			const parent = navigateToNode(tree, change.parent);
			assert(parent?.is(fuzzNode), "Defined down-path should point to a valid parent");
			const field = parent.boxedSequenceChildren;
			field.insertAt(change.index, [singleTextCursor(change.value) as any]);
			break;
		}
		case "delete": {
			const firstNode = navigateToNode(tree, change.firstNode);
			assert(firstNode !== undefined, "Down-path should point to a valid firstNode");
			const { parent: field, index } = firstNode.parentField;
			assert(
				field?.is(fuzzNode.objectNodeFieldsObject.sequenceChildren),
				"Defined down-path should point to a valid parent",
			);
			field.removeRange(index, change.count);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyValueFieldEdit(tree: ISharedTreeView, change: FuzzSet): void {
	assert(change.parent !== undefined, "Value change should not occur at the root.");
	const parent = navigateToNode(tree, change.parent);
	assert(parent?.is(fuzzNode), "Defined down-path should point to a valid parent");
	const field = parent.tryGetField(change.key);
	assert(
		field?.is(fuzzNode.objectNodeFieldsObject.requiredChild),
		"Parent of Value change should have an optional field to modify",
	);
	field.content = singleTextCursor(change.value) as any;
}

function navigateToNode(tree: ISharedTreeView, path: DownPath | undefined): TreeNode | undefined {
	const rootField = getEditableTree(tree);
	if (path === undefined) {
		return undefined;
	}

	const finalLocation = path.reduce<{
		field: TreeField;
		containedNode: TreeNode | undefined;
	}>(
		({ containedNode }, nextStep) => {
			const childField = containedNode?.tryGetField(nextStep.field);
			// Checking "=== true" causes tsc to fail to typecheck, as it is no longer able to narrow according
			// to the .is typeguard.
			/* eslint-disable @typescript-eslint/strict-boolean-expressions */
			if (childField?.is(fuzzNode.objectNodeFieldsObject.sequenceChildren)) {
				assert(nextStep.index !== undefined);
				return {
					field: childField,
					containedNode: childField.at(nextStep.index),
				};
			} else if (
				// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
				childField?.is(fuzzNode.objectNodeFieldsObject.optionalChild) ||
				childField?.is(fuzzNode.objectNodeFieldsObject.requiredChild)
			) {
				return { field: childField, containedNode: childField.content };
			}
			/* eslint-enable @typescript-eslint/strict-boolean-expressions */

			fail(`Unexpected field type: ${childField?.key}`);
		},
		{ field: rootField, containedNode: rootField.content },
	);

	return finalLocation.containedNode;
}

function applyOptionalFieldEdit(tree: ISharedTreeView, change: FuzzSet | FuzzDelete): void {
	switch (change.type) {
		case "set": {
			const rootField = getEditableTree(tree);
			if (change.parent === undefined) {
				rootField.content = singleTextCursor(change.value) as any;
			} else {
				const parent = navigateToNode(tree, change.parent);
				assert(parent?.is(fuzzNode), "Defined down-path should point to a valid parent");
				parent.boxedOptionalChild.content = singleTextCursor(change.value) as any;
			}
			break;
		}
		case "delete": {
			const field = navigateToNode(tree, change.firstNode)?.parentField.parent;
			assert(field?.is(fuzzNode.objectNodeFieldsObject.optionalChild));
			field.content = undefined;
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

export function applyUndoRedoEdit(
	undoStack: Revertible[],
	redoStack: Revertible[],
	contents: FuzzUndoRedoType,
): void {
	switch (contents.type) {
		case "undo": {
			undoStack.pop()?.revert();
			break;
		}
		case "redo": {
			redoStack.pop()?.revert();
			break;
		}
		default:
			fail("Invalid edit.");
	}
}
