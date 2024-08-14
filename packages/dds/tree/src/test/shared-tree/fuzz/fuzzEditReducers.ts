/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { type AsyncReducer, combineReducers } from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzTestState, Client } from "@fluid-private/test-dds-utils";
import { unreachableCase } from "@fluidframework/core-utils/internal";

import { type Revertible, ValueSchema } from "../../../core/index.js";
import {
	type DownPath,
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	SchemaBuilderInternal,
	cursorForJsonableTreeField,
	cursorForJsonableTreeNode,
	intoStoredSchema,
	type Any,
	mapTreeFromCursor,
	mapTreeFieldFromCursor,
} from "../../../feature-libraries/index.js";
import type { SharedTreeFactory } from "../../../shared-tree/index.js";
import { brand, fail } from "../../../util/index.js";
import { moveWithin, validateFuzzTreeConsistency } from "../../utils.js";

import {
	type FuzzTestState,
	type FuzzTransactionView,
	type FuzzView,
	getAllowableNodeTypes,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { createTreeViewSchema, isRevertibleSharedTreeView } from "./fuzzUtils.js";
import type {
	FieldDownPath,
	FieldEdit,
	ClearField,
	Insert,
	Remove,
	SetField,
	IntraFieldMove,
	Operation,
	SchemaChange,
	TransactionBoundary,
	UndoRedo,
	CrossFieldMove,
	Constraint,
} from "./operationTypes.js";

const syncFuzzReducer = combineReducers<Operation, DDSFuzzTestState<SharedTreeFactory>>({
	treeEdit: (state, { edit }) => {
		switch (edit.type) {
			case "fieldEdit": {
				applyFieldEdit(viewFromState(state), edit);
				break;
			}
			default:
				break;
		}
	},
	transactionBoundary: (state, { boundary }) => {
		applyTransactionBoundary(state, boundary);
	},
	undoRedo: (state, { operation }) => {
		const view = viewFromState(state).checkout;
		assert(isRevertibleSharedTreeView(view));
		applyUndoRedoEdit(view.undoStack, view.redoStack, operation);
	},
	synchronizeTrees: (state) => {
		applySynchronizationOp(state);
	},
	schemaChange: (state, operation) => {
		applySchemaOp(state, operation);
	},
	constraint: (state, operation) => {
		applyConstraint(state, operation);
	},
});
export const fuzzReducer: AsyncReducer<
	Operation,
	DDSFuzzTestState<SharedTreeFactory>
> = async (state, operation) => syncFuzzReducer(state, operation);

export function checkTreesAreSynchronized(trees: readonly Client<SharedTreeFactory>[]) {
	for (const tree of trees) {
		validateFuzzTreeConsistency(trees[0], tree);
	}
}

export function applySynchronizationOp(state: DDSFuzzTestState<SharedTreeFactory>) {
	state.containerRuntimeFactory.processAllMessages();
	const connectedClients = state.clients.filter((client) => client.containerRuntime.connected);
	if (connectedClients.length > 0) {
		const readonlyClient = state.summarizerClient;
		for (const client of connectedClients) {
			validateFuzzTreeConsistency(client, readonlyClient);
		}
	}
}

// TODO: Update this function to be done in a more ergonomic way using libraries
export function generateLeafNodeSchemas(nodeTypes: string[]) {
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
	const nodeTypes = getAllowableNodeTypes(state);
	nodeTypes.push(brand(operation.operation.type));
	const { leafNodeSchemas, library } = generateLeafNodeSchemas(nodeTypes);
	const newSchema = createTreeViewSchema(leafNodeSchemas, library);
	const view = viewFromState(state, state.client);
	view.checkout.updateSchema(intoStoredSchema(newSchema));
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
	field: FlexTreeSequenceField<readonly [Any]>,
	change: Insert | Remove | IntraFieldMove | CrossFieldMove,
): void {
	switch (change.type) {
		case "insert": {
			field.editor.insert(
				change.index,
				mapTreeFieldFromCursor(cursorForJsonableTreeField(change.content)),
			);
			break;
		}
		case "remove": {
			field.editor.remove(change.range.first, change.range.last + 1 - change.range.first);
			break;
		}
		case "intraFieldMove": {
			moveWithin(
				tree.checkout.editor,
				field.getFieldPath(),
				change.range.first,
				change.range.last + 1 - change.range.first,
				change.dstIndex,
			);
			break;
		}
		case "crossFieldMove": {
			const dstField = navigateToField(tree, change.dstField);
			assert(dstField.is(tree.currentSchema.objectNodeFieldsObject.sequenceChildren));
			assert(dstField.context !== undefined, "Expected LazyField");
			dstField.context.checkout.editor.move(
				field.getFieldPath(),
				change.range.first,
				change.range.last + 1 - change.range.first,
				dstField.getFieldPath(),
				change.dstIndex,
			);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyRequiredFieldEdit(
	tree: FuzzView,
	field: FlexTreeRequiredField<readonly [Any]>,
	change: SetField,
): void {
	switch (change.type) {
		case "set": {
			field.editor.set(mapTreeFromCursor(cursorForJsonableTreeNode(change.value)));
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyOptionalFieldEdit(
	tree: FuzzView,
	field: FlexTreeOptionalField<readonly [Any]>,
	change: SetField | ClearField,
): void {
	switch (change.type) {
		case "set": {
			field.editor.set(
				mapTreeFromCursor(cursorForJsonableTreeNode(change.value)),
				field.length === 0,
			);
			break;
		}
		case "clear": {
			field.editor.set(undefined, field.length === 0);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

export function applyTransactionBoundary(
	state: FuzzTestState,
	boundary: TransactionBoundary["boundary"],
): void {
	state.transactionViews ??= new Map();
	let view = state.transactionViews.get(state.client.channel);
	if (view === undefined) {
		assert(
			boundary === "start",
			"Forked view should be present in the fuzz state unless a (non-nested) transaction is being started.",
		);
		const treeView = viewFromState(state);
		view = treeView.fork() as FuzzTransactionView;
		view.currentSchema = treeView.currentSchema;
		state.transactionViews.set(state.client.channel, view);
	}

	const { checkout } = view;
	switch (boundary) {
		case "start": {
			checkout.transaction.start();
			break;
		}
		case "commit": {
			checkout.transaction.commit();
			break;
		}
		case "abort": {
			checkout.transaction.abort();
			break;
		}
		default:
			unreachableCase(boundary);
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
	operation: UndoRedo["operation"],
): void {
	switch (operation) {
		case "undo": {
			undoStack.pop()?.revert();
			break;
		}
		case "redo": {
			redoStack.pop()?.revert();
			break;
		}
		default:
			unreachableCase(operation);
	}
}

export function applyConstraint(state: FuzzTestState, constraint: Constraint) {
	const tree = viewFromState(state);
	switch (constraint.content.type) {
		case "nodeConstraint": {
			const constraintNodePath = constraint.content.path;
			const constraintNode =
				constraintNodePath !== undefined
					? navigateToNode(tree, constraintNodePath)
					: undefined;
			if (constraintNode !== undefined) {
				tree.checkout.editor.addNodeExistsConstraint(constraintNode.anchorNode);
			}
			break;
		}
		default:
			unreachableCase(constraint.content.type);
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
