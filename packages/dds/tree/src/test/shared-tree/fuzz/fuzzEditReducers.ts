/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { type AsyncReducer, combineReducers } from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzTestState, Client } from "@fluid-private/test-dds-utils";
import { unreachableCase } from "@fluidframework/core-utils/internal";

import { type Revertible, rootFieldKey } from "../../../core/index.js";
import {
	type DownPath,
	intoStoredSchema,
	jsonableTreeFromForest,
} from "../../../feature-libraries/index.js";
import {
	Tree,
	type ITreeCheckoutFork,
	type SharedTreeFactory,
} from "../../../shared-tree/index.js";
import { fail } from "../../../util/index.js";
import { validateFuzzTreeConsistency, viewCheckout } from "../../utils.js";

import {
	type FuzzTestState,
	type FuzzTransactionView,
	type FuzzView,
	getAllowableNodeTypes,
	viewFromState,
	simpleSchemaFromStoredSchema,
} from "./fuzzEditGenerators.js";
import {
	createTreeViewSchema,
	FuzzNode,
	isRevertibleSharedTreeView,
	FuzzStringNode,
	FuzzNumberNode,
	FuzzHandleNode,
	SequenceChildren,
} from "./fuzzUtils.js";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	type FieldDownPath,
	type FieldEdit,
	type ClearField,
	type Insert,
	type Remove,
	type SetField,
	type IntraFieldMove,
	type Operation,
	type SchemaChange,
	type TransactionBoundary,
	type UndoRedo,
	type CrossFieldMove,
	type Constraint,
	type GeneratedFuzzNode,
	GeneratedFuzzValueType,
} from "./operationTypes.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeNode } from "../../../simple-tree/types.js";
// eslint-disable-next-line import/no-internal-modules
import { SchemaFactory } from "../../../simple-tree/schemaFactory.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../../simple-tree/toFlexSchema.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeNodeSchema } from "../../../simple-tree/schemaTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeViewConfiguration } from "../../../simple-tree/tree.js";
// eslint-disable-next-line import/no-internal-modules
import { getOrCreateInnerNode } from "../../../simple-tree/proxyBinding.js";

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
export function generateLeafNodeSchemas(nodeTypes: string[]): TreeNodeSchema[] {
	const builder = new SchemaFactory("treeFuzz");
	const leafNodeSchemas = [];
	for (const nodeType of nodeTypes) {
		if (
			nodeType !== "treeFuzz.node" &&
			nodeType !== "treeFuzz.FuzzStringNode" &&
			nodeType !== "treeFuzz.FuzzNumberNode"
		) {
			const fuzzNodeTypePrefix = "treeFuzz.";
			if (!nodeType.startsWith(fuzzNodeTypePrefix)) {
				class GuidNode extends builder.object(nodeType.slice(fuzzNodeTypePrefix.length), {
					value: builder.required(builder.number),
				}) {}
				leafNodeSchemas.push(GuidNode);
			}
		}
	}
	return leafNodeSchemas;
}
export function applySchemaOp(state: FuzzTestState, operation: SchemaChange) {
	const nodeTypes = getAllowableNodeTypes(state);
	nodeTypes.push(operation.operation.type);
	const leafNodeSchemas = generateLeafNodeSchemas(nodeTypes);
	const newSchema = createTreeViewSchema(leafNodeSchemas);

	const view = viewFromState(state, state.client);
	assert(Tree.is(view.root, view.currentSchema));
	view.checkout.updateSchema(intoStoredSchema(toFlexSchema(newSchema))); // TODO: use public api

	const view2 = viewFromState(state, state.client);
	assert(Tree.is(view2.root, view2.currentSchema));
}

/**
 * Assumes tree is using the fuzzSchema.
 * TODO: Maybe take in a schema aware strongly typed Tree node or field.
 */
export function applyFieldEdit(tree: FuzzView, fieldEdit: FieldEdit): void {
	const parentField = Tree.parent(fieldEdit.field) as FuzzNode;
	switch (fieldEdit.change.type) {
		case "sequence":
			// assert(field.is(tree.currentSchema.objectNodeFieldsObject.sequenceChildren));
			applySequenceFieldEdit(tree, parentField, fieldEdit.change.edit);
			break;
		case "required":
			// assert(field.is(tree.currentSchema.objectNodeFieldsObject.requiredChild));
			applyRequiredFieldEdit(tree, parentField, fieldEdit.change.edit);
			break;
		case "optional":
			// assert(field.is(tree.currentSchema.objectNodeFieldsObject.optionalChild));
			applyOptionalFieldEdit(tree, parentField, fieldEdit.change.edit);
			break;
		default:
			break;
	}
}

function applySequenceFieldEdit(
	tree: FuzzView,
	parentNode: FuzzNode,
	change: Insert | Remove | IntraFieldMove | CrossFieldMove,
): void {
	switch (change.type) {
		case "insert": {
			parentNode.sequenceChildren.insertAt(
				change.index,
				Array.isArray(change.content)
					? change.content.map(generateFuzzLeafNode)
					: generateFuzzLeafNode(change.content),
			);
			break;
		}
		case "remove": {
			parentNode.sequenceChildren.removeRange(
				change.range.first,
				change.range.last + 1 - change.range.first,
			);
			break;
		}
		case "intraFieldMove": {
			const l = parentNode.sequenceChildren.length;

			parentNode.sequenceChildren.moveRangeToIndex(
				change.dstIndex,
				change.range.first,
				change.range.last + 1,
			);
			const test = jsonableTreeFromForest(tree.checkout.forest);
			break;
		}
		case "crossFieldMove": {
			const dstField = change.dstField;
			// assert(dstField.is(tree.currentSchema.objectNodeFieldsObject.sequenceChildren));

			dstField.moveRangeToIndex(
				change.dstIndex,
				change.range.first,
				change.range.last + 1,
				parentNode.sequenceChildren,
			);
			const test = jsonableTreeFromForest(tree.checkout.forest);

			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyRequiredFieldEdit(tree: FuzzView, parentNode: FuzzNode, change: SetField): void {
	switch (change.type) {
		case "set": {
			parentNode.requiredChild = generateFuzzLeafNode(change.value);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyOptionalFieldEdit(
	tree: FuzzView,
	parentNode: FuzzNode,
	change: SetField | ClearField,
): void {
	switch (change.type) {
		case "set": {
			parentNode.optionalChild = generateFuzzLeafNode(change.value);
			break;
		}
		case "clear": {
			parentNode.optionalChild = undefined;
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
		const treeViewFork = viewFromState(state).checkout.fork();
		const treeSchema = simpleSchemaFromStoredSchema(state.client.channel.storedSchema);
		const treeView = viewCheckout(
			treeViewFork,
			new TreeViewConfiguration({ schema: treeSchema }),
		);
		view = treeView as FuzzTransactionView;
		const nodeSchema = Array.from(treeSchema.allowedTypeSet).find(
			(treeNodeSchema) => treeNodeSchema.identifier === "treeFuzz.node",
		) as typeof FuzzNode | undefined;
		view.currentSchema = nodeSchema ?? assert.fail("nodeSchema should not be undefined");
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
		rootView.checkout.merge(checkout as ITreeCheckoutFork);
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
				tree.checkout.editor.addNodeExistsConstraint(
					getOrCreateInnerNode(constraintNode).anchorNode,
				);
			}
			break;
		}
		default:
			unreachableCase(constraint.content.type);
	}
}

/**
 * Parent node and key to provide information about the field location.
 * If parent node is an arrayNode, the key will be an index. Otherwise, a FieldKey.
 * If both values are undefined, it is at the root.
 */
interface FuzzFieldLocation {
	parentNode: TreeNode | undefined;
	key: string | number | undefined;
}

function navigateToField(tree: FuzzView, path: FieldDownPath): FuzzFieldLocation {
	const nodeSchema = tree.currentSchema;
	assert(Tree.is(tree.root, tree.currentSchema));
	if (path.parent === undefined) {
		return { parentNode: undefined, key: rootFieldKey };
	} else {
		const parent = navigateToNode(tree, path.parent);
		const test = Tree.key(parent);
		assert(Tree.is(parent, nodeSchema), "Defined down-path should point to a valid parent");
		switch (path.key) {
			case "sequenceChildren":
			case "optionalChild":
			case "requiredChild":
				return { parentNode: parent, key: path.key };
			default:
				fail("Unknown field key");
		}
	}
}
function navigateToNode(tree: FuzzView, path: DownPath): TreeNode {
	let currentNode = tree.root as TreeNode;
	for (const pathStep of path) {
		switch (pathStep.field) {
			case "rootFieldKey":
				break;
			case "sequenceChildren": {
				const sequenceChildren =
					(currentNode as FuzzNode).sequenceChildren ??
					fail(`Unexpected field type: ${pathStep.field}`);

				assert(pathStep.index !== undefined);
				currentNode =
					(sequenceChildren.at(pathStep.index) as TreeNode) ?? fail("Index out of bounds.");
				if (!Tree.is(currentNode, tree.currentSchema)) {
					return sequenceChildren;
				}
				break;
			}
			case "optionalChild": {
				const optionalChild =
					(currentNode as FuzzNode).optionalChild ??
					fail(`Unexpected field type: ${pathStep.field}`);
				currentNode = optionalChild;
				break;
			}
			case "requiredChild": {
				const requiredChild =
					(currentNode as FuzzNode).requiredChild ??
					fail(`Unexpected field type: ${pathStep.field}`);
				currentNode = requiredChild;
				break;
			}
			default:
				fail(`Unexpected field type: ${pathStep.field}`);
		}
	}

	return currentNode;
}

function generateFuzzLeafNode(node: GeneratedFuzzNode) {
	switch (node.type) {
		case GeneratedFuzzValueType.String:
			return new FuzzStringNode({ stringValue: node.value as string });
		case GeneratedFuzzValueType.Number:
			return new FuzzNumberNode({ value: node.value as number });
		case GeneratedFuzzValueType.Handle:
			return new FuzzHandleNode({ value: node.value as IFluidHandle });
		case GeneratedFuzzValueType.NodeObject:
			return new FuzzNode({
				requiredChild: new FuzzNumberNode({ value: node.value as number }),
				sequenceChildren: new SequenceChildren([]),
			});
		default:
			return new FuzzStringNode({ stringValue: node.value as string });
	}
}
