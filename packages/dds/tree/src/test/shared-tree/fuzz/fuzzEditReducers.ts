/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { type AsyncReducer, combineReducers } from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzTestState, Client } from "@fluid-private/test-dds-utils";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

import { type Revertible, rootFieldKey } from "../../../core/index.js";
import type { DownPath } from "../../../feature-libraries/index.js";
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
	type FuzzNode,
	isRevertibleSharedTreeView,
	FuzzStringNode,
	FuzzNumberNode,
	FuzzHandleNode,
	type SequenceChildren,
	nodeSchemaFromTreeSchema,
} from "./fuzzUtils.js";

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
	type NodeObjectValue,
} from "./operationTypes.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeNode } from "../../../simple-tree/types.js";
// eslint-disable-next-line import/no-internal-modules
import { SchemaFactory } from "../../../simple-tree/schemaFactory.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeNodeSchema } from "../../../simple-tree/schemaTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeViewConfiguration } from "../../../simple-tree/tree.js";
// eslint-disable-next-line import/no-internal-modules
import { getOrCreateInnerNode } from "../../../simple-tree/proxyBinding.js";
// eslint-disable-next-line import/no-internal-modules
import { isObjectNodeSchema } from "../../../simple-tree/objectNodeTypes.js";

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
	nodeTypes.push(operation.contents.type);
	const leafNodeSchemas = generateLeafNodeSchemas(nodeTypes);
	const newSchema = createTreeViewSchema(leafNodeSchemas);

	// Because we need the view for a schema change, and we can only have one view at a time,
	// we must dispose of the client's view early.
	const view = viewFromState(state, state.client);
	view.dispose();
	state.transactionViews?.delete(state.client.channel);

	const newView = state.client.channel.viewWith(
		new TreeViewConfiguration({ schema: newSchema }),
	);
	newView.upgradeSchema();
}

/**
 * Assumes tree is using the fuzzSchema.
 * TODO: Maybe take in a schema aware strongly typed Tree node or field.
 */
export function applyFieldEdit(tree: FuzzView, fieldEdit: FieldEdit): void {
	const parentNode = fieldEdit.parentNodePath
		? navigateToNode(tree, fieldEdit.parentNodePath) ?? tree.root
		: tree.root;
	assert(Tree.is(parentNode, tree.currentSchema));

	switch (fieldEdit.change.type) {
		case "sequence":
			applySequenceFieldEdit(tree, parentNode, fieldEdit.change.edit);
			break;
		case "required":
			applyRequiredFieldEdit(tree, parentNode, fieldEdit.change.edit);
			break;
		case "optional":
			applyOptionalFieldEdit(tree, parentNode, fieldEdit.change.edit);
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
			const insertValues = change.content.map((value) =>
				generateFuzzLeafNode(value, parentNode),
			);
			for (let index = change.index; index < insertValues.length; index++) {
				parentNode.sequenceChildren.insertAt(index, insertValues[index - change.index]);
			}
			Tree.parent(parentNode.sequenceChildren);
			break;
		}
		case "remove": {
			parentNode.sequenceChildren.removeRange(change.range.first, change.range.last + 1);
			break;
		}
		case "intraFieldMove": {
			parentNode.sequenceChildren.moveRangeToIndex(
				change.dstIndex,
				change.range.first,
				change.range.last + 1,
			);
			break;
		}
		case "crossFieldMove": {
			const dstParentNode = change.dstField
				? navigateToNode(tree, change.dstField)
				: tree.root;
			assert(Tree.is(dstParentNode, tree.currentSchema));
			dstParentNode.sequenceChildren.moveRangeToIndex(
				change.dstIndex,
				change.range.first,
				change.range.last + 1,
				parentNode.sequenceChildren,
			);

			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyRequiredFieldEdit(tree: FuzzView, parentNode: FuzzNode, change: SetField): void {
	switch (change.type) {
		case "set": {
			parentNode.requiredChild = generateFuzzLeafNode(change.value, parentNode);
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
			parentNode.optionalChild = generateFuzzLeafNode(change.value, parentNode);
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
		const nodeSchema = nodeSchemaFromTreeSchema(treeSchema);
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
			const constraintNode = constraint.content.nodePath
				? navigateToNode(tree, constraint.content.nodePath)
				: tree.root;

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
			case "":
				assert(pathStep.index !== undefined);
				currentNode = (currentNode as SequenceChildren).at(pathStep.index) as TreeNode;
				break;
			case "sequenceChildren": {
				const sequenceChildren =
					(currentNode as FuzzNode).sequenceChildren ??
					fail(`Unexpected field type: ${pathStep.field}`);

				currentNode = sequenceChildren;
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
function getNodeSchemaForNodeType(node: TreeNode, nodeType: string) {
	const nodeSchema = Tree.schema(node);
	assert(isObjectNodeSchema(nodeSchema));
	const nodeSchemaField = nodeSchema.fields.get("requiredChild");
	assert(nodeSchemaField !== undefined);
	const allowedTypes = nodeSchemaField.allowedTypeSet;
	const simpleNodeSchema = Array.from(allowedTypes).find(
		(treeNodeSchema) => treeNodeSchema.identifier === nodeType,
	);
	const simpleSchema = simpleNodeSchema as unknown as new (dummy: unknown) => TreeNode;
	return simpleSchema;
}
function generateFuzzLeafNode(node: GeneratedFuzzNode, tree: TreeNode) {
	switch (node.type) {
		case GeneratedFuzzValueType.String:
			return new FuzzStringNode({ stringValue: node.value as string });
		case GeneratedFuzzValueType.Number:
			return new FuzzNumberNode({ value: node.value as number });
		case GeneratedFuzzValueType.Handle:
			return new FuzzHandleNode({ value: node.value as IFluidHandle });
		case GeneratedFuzzValueType.NodeObject: {
			const nodeObjectSchema = getNodeSchemaForNodeType(tree, "treeFuzz.node");
			return new nodeObjectSchema({
				requiredChild: new FuzzNumberNode({
					value: (node.value as NodeObjectValue).requiredChild,
				}),
				sequenceChildren: [],
			}) as FuzzNode;
		}
		default:
			return new FuzzStringNode({ stringValue: node.value as string });
	}
}
