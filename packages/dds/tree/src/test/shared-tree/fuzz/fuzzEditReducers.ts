/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AsyncReducer, combineReducers } from "@fluid-private/stochastic-test-utils";
import { DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import { Revertible, ValueSchema } from "../../../core/index.js";
import {
	DownPath,
	FlexTreeField,
	FlexTreeNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	SchemaBuilderInternal,
	cursorForJsonableTreeField,
	cursorForJsonableTreeNode,
	intoStoredSchema,
} from "../../../feature-libraries/index.js";
import { ISharedTree, SharedTree, SharedTreeFactory } from "../../../shared-tree/index.js";
import { brand, fail } from "../../../util/index.js";
import { validateTreeConsistency } from "../../utils.js";
import {
	FuzzTestState,
	FuzzTransactionView,
	FuzzView,
	getAllowableNodeTypes,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { createTreeViewSchema, isRevertibleSharedTreeView } from "./fuzzUtils.js";
import {
	FieldDownPath,
	FieldEdit,
	FuzzClear,
	FuzzInsert,
	FuzzRemove,
	FuzzSet,
	FuzzTransactionType,
	FuzzUndoRedoType,
	IntraFieldMove,
	Operation,
	SchemaChange,
} from "./operationTypes.js";

const syncFuzzReducer = combineReducers<Operation, DDSFuzzTestState<SharedTreeFactory>>({
	edit: (state, operation) => {
		const { contents } = operation;
		switch (contents.type) {
			case "fieldEdit": {
				applyFieldEdit(viewFromState(state), contents);
				break;
			}
			default:
				break;
		}
	},
	transaction: (state, operation) => {
		applyTransactionEdit(state, operation.contents);
	},
	undoRedo: (state, operation) => {
		const view = viewFromState(state).checkout;
		assert(isRevertibleSharedTreeView(view));
		applyUndoRedoEdit(view.undoStack, view.redoStack, operation.contents);
	},
	synchronizeTrees: (state) => {
		applySynchronizationOp(state);
	},
	schema: (state, operation) => {
		applySchemaOp(state, operation);
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

// TODO: Update this function to be done in a more ergonomic way using libraries
function generateLeafNodeSchemas(nodeTypes: string[]) {
	const builder = new SchemaBuilderInternal({ scope: "com.fluidframework.leaf" });
	const leafNodeSchemas = [];
	for (const nodeType of nodeTypes) {
		if (
			nodeType !== "treefuzz.node" &&
			nodeType !== "com.fluidframework.leaf.number" &&
			nodeType !== "com.fluidframework.leaf.string"
		) {
			if (!nodeType.startsWith("com.fluidframework.leaf")) {
				leafNodeSchemas.push(builder.leaf(nodeType, ValueSchema.Number));
			}
		}
	}
	const library = builder.intoLibrary();
	return { leafNodeSchemas, library };
}
export function applySchemaOp(state: FuzzTestState, operation: SchemaChange) {
	const tree = state.client.channel as SharedTree;
	const nodeTypes = getAllowableNodeTypes(state);
	nodeTypes.push(brand(operation.contents.type));
	const { leafNodeSchemas, library } = generateLeafNodeSchemas(nodeTypes);
	const newSchema = createTreeViewSchema(leafNodeSchemas, library);
	tree.checkout.updateSchema(intoStoredSchema(newSchema));
}

/**
 * Assumes tree is using the fuzzSchema.
 * TODO: Maybe take in a schema aware strongly typed Tree node or field.
 */
export function applyFieldEdit(tree: FuzzView, fieldEdit: FieldEdit): void {
	const field = navigateToField(tree, fieldEdit.field);
	switch (fieldEdit.change.type) {
		case "sequence":
			assert(field.is(tree.currentSchema.objectNodeFieldsObject.sequenceChildren));
			applySequenceFieldEdit(tree, field, fieldEdit.change.edit);
			break;
		case "required":
			assert(field.is(tree.currentSchema.objectNodeFieldsObject.requiredChild));
			applyRequiredFieldEdit(tree, field, fieldEdit.change.edit);
			break;
		case "optional":
			assert(field.is(tree.currentSchema.objectNodeFieldsObject.optionalChild));
			applyOptionalFieldEdit(tree, field, fieldEdit.change.edit);
			break;
		default:
			break;
	}
}

function applySequenceFieldEdit(
	tree: FuzzView,
	field: FlexTreeSequenceField<any>,
	change: FuzzInsert | FuzzRemove | IntraFieldMove,
): void {
	switch (change.type) {
		case "insert": {
			field.insertAt(change.index, cursorForJsonableTreeField(change.content));
			break;
		}
		case "remove": {
			field.removeRange(change.range.first, change.range.last + 1);
			break;
		}
		case "intra-field move": {
			field.moveRangeToIndex(change.dstIndex, change.range.first, change.range.last + 1);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyRequiredFieldEdit(
	tree: FuzzView,
	field: FlexTreeRequiredField<any>,
	change: FuzzSet,
): void {
	switch (change.type) {
		case "set": {
			field.content = cursorForJsonableTreeNode(change.value) as any;
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyOptionalFieldEdit(
	tree: FuzzView,
	field: FlexTreeOptionalField<any>,
	change: FuzzSet | FuzzClear,
): void {
	switch (change.type) {
		case "set": {
			field.content = cursorForJsonableTreeNode(change.value);
			break;
		}
		case "clear": {
			field.content = undefined;
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

export function applyTransactionEdit(state: FuzzTestState, contents: FuzzTransactionType): void {
	state.transactionViews ??= new Map();
	let view = state.transactionViews.get(state.client.channel);
	if (view === undefined) {
		assert(
			contents.fuzzType === "transactionStart",
			"Forked view should be present in the fuzz state unless a (non-nested) transaction is being started.",
		);
		const treeView = viewFromState(state);
		view = treeView.fork() as FuzzTransactionView;
		view.currentSchema = treeView.currentSchema;
		state.transactionViews.set(state.client.channel, view);
	}

	const { checkout } = view;
	switch (contents.fuzzType) {
		case "transactionStart": {
			checkout.transaction.start();
			break;
		}
		case "transactionCommit": {
			checkout.transaction.commit();
			break;
		}
		case "transactionAbort": {
			checkout.transaction.abort();
			break;
		}
		default:
			fail("Invalid edit.");
	}

	if (!checkout.transaction.inProgress()) {
		// Transaction is complete, so merge the changes into the root view and clean up the fork from the state.
		state.transactionViews.delete(state.client.channel);
		const rootView = viewFromState(state);
		rootView.checkout.merge(checkout);
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

function navigateToField(tree: FuzzView, path: FieldDownPath): FlexTreeField {
	const nodeSchema = tree.currentSchema;
	if (path.parent === undefined) {
		return tree.flexTree;
	} else {
		const parent = navigateToNode(tree, path.parent);
		assert(parent.is(nodeSchema), "Defined down-path should point to a valid parent");
		switch (path.key) {
			case "sequenceChildren":
				return parent.boxedSequenceChildren;
			case "optionalChild":
				return parent.boxedOptionalChild;
			case "requiredChild":
				return parent.boxedRequiredChild;
			default:
				fail("Unknown field key");
		}
	}
}

function navigateToNode(tree: FuzzView, path: DownPath): FlexTreeNode {
	const nodeSchema = tree.currentSchema;
	const rootField = tree.flexTree;
	const finalLocation = path.reduce<{
		field: FlexTreeField;
		containedNode: FlexTreeNode;
	}>(
		({ containedNode }, nextStep) => {
			const childField = containedNode?.tryGetField(nextStep.field);
			// Checking "=== true" causes tsc to fail to typecheck, as it is no longer able to narrow according
			// to the .is typeguard.
			/* eslint-disable @typescript-eslint/strict-boolean-expressions */
			if (childField?.is(nodeSchema.objectNodeFieldsObject.sequenceChildren)) {
				assert(nextStep.index !== undefined);
				return {
					field: childField,
					containedNode: childField.at(nextStep.index) ?? fail("Index out of bounds."),
				};
			} else if (
				// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
				childField?.is(nodeSchema.objectNodeFieldsObject.optionalChild) ||
				childField?.is(nodeSchema.objectNodeFieldsObject.requiredChild)
			) {
				return {
					field: childField,
					containedNode: childField.content ?? fail("Missing child"),
				};
			}
			/* eslint-enable @typescript-eslint/strict-boolean-expressions */

			fail(`Unexpected field type: ${childField?.key}`);
		},
		{ field: rootField, containedNode: rootField.content ?? fail("Missing root") },
	);

	return finalLocation.containedNode;
}
