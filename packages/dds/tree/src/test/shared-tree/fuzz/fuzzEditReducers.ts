/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type AsyncReducer, combineReducers } from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzTestState, Client } from "@fluid-private/test-dds-utils";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

import type { Revertible } from "../../../core/index.js";
import type { DownPath } from "../../../feature-libraries/index.js";
import { Tree, type SharedTree } from "../../../shared-tree/index.js";
import { fail } from "../../../util/index.js";
import { validateFuzzTreeConsistency } from "../../utils.js";

import {
	type FuzzTestState,
	type FuzzTransactionView,
	type FuzzView,
	getAllowableNodeTypes,
	viewFromState,
} from "./fuzzEditGenerators.js";
import {
	createTreeViewSchema,
	type FuzzNode,
	isRevertibleSharedTreeView,
	type ArrayChildren,
	nodeSchemaFromTreeSchema,
	type GUIDNode,
	convertToFuzzView,
} from "./fuzzUtils.js";

import {
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
	type GUIDNodeValue,
	type ForkMergeOperation,
} from "./operationTypes.js";

import { getOrCreateInnerNode } from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { isObjectNodeSchema } from "../../../simple-tree/objectNodeTypes.js";
import {
	SchemaFactory,
	TreeArrayNode,
	TreeViewConfiguration,
	type TreeNode,
	type TreeNodeSchema,
} from "../../../simple-tree/index.js";
import type { TreeFactory } from "../../../treeFactory.js";

const syncFuzzReducer = combineReducers<Operation, DDSFuzzTestState<TreeFactory>>({
	treeEdit: (state, { edit, forkedViewIndex }) => {
		switch (edit.type) {
			case "fieldEdit": {
				applyFieldEdit(viewFromState(state, state.client, forkedViewIndex), edit);
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
	forkMergeOperation: (state, operation) => {
		applyForkMergeOperation(state, operation);
	},
});
export const fuzzReducer: AsyncReducer<Operation, DDSFuzzTestState<TreeFactory>> = async (
	state,
	operation,
) => syncFuzzReducer(state, operation);

export function checkTreesAreSynchronized(trees: readonly Client<TreeFactory>[]) {
	for (const tree of trees) {
		validateFuzzTreeConsistency(trees[0], tree);
	}
}

export function applySynchronizationOp(state: DDSFuzzTestState<TreeFactory>) {
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
			nodeType !== "treeFuzz.FuzzNumberNode" &&
			nodeType !== "treeFuzz.FuzzHandleNode"
		) {
			const fuzzNodeTypePrefix = "treeFuzz.";
			const nodeIdentifier = nodeType.startsWith(fuzzNodeTypePrefix)
				? nodeType.slice(fuzzNodeTypePrefix.length)
				: nodeType;
			class GuidNode extends builder.object(nodeIdentifier, {
				value: builder.required(builder.string),
			}) {}
			leafNodeSchemas.push(GuidNode);
		}
	}
	return leafNodeSchemas;
}

export function generateLeafNodeSchemas2(nodeTypes: string[]): TreeNodeSchema[] {
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
				class GuidNode extends builder.object(nodeType, {
					value: builder.required(builder.string),
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
	) as FuzzTransactionView;
	newView.upgradeSchema();

	newView.currentSchema =
		nodeSchemaFromTreeSchema(newSchema) ?? fail("nodeSchema should not be undefined.");

	const transactionViews = state.transactionViews ?? new Map();
	transactionViews.set(state.client.channel, newView);
	state.transactionViews = transactionViews;
}

export function applyForkMergeOperation(state: FuzzTestState, branchEdit: ForkMergeOperation) {
	switch (branchEdit.contents.type) {
		case "fork": {
			const forkedViews = state.forkedViews ?? new Map<SharedTree, FuzzView[]>();
			const clientForkedViews = forkedViews.get(state.client.channel) ?? [];

			if (branchEdit.contents.branchNumber !== undefined) {
				assert(clientForkedViews.length > branchEdit.contents.branchNumber);
			}

			const view =
				branchEdit.contents.branchNumber !== undefined
					? clientForkedViews[branchEdit.contents.branchNumber]
					: viewFromState(state);
			assert(view !== undefined);
			const forkedView = view.fork();
			convertToFuzzView(forkedView, view.currentSchema);
			clientForkedViews?.push(forkedView);
			forkedViews.set(state.client.channel, clientForkedViews);
			state.forkedViews = forkedViews;
			break;
		}
		case "merge": {
			const forkBranchIndex = branchEdit.contents.forkBranch;
			const forkedViews = state.forkedViews ?? new Map<SharedTree, FuzzView[]>();
			const clientForkedViews = forkedViews.get(state.client.channel) ?? [];

			const baseBranch =
				branchEdit.contents.baseBranch !== undefined
					? clientForkedViews[branchEdit.contents.baseBranch]
					: viewFromState(state);
			assert(forkBranchIndex !== undefined);
			const forkedBranch = clientForkedViews[forkBranchIndex];
			if (baseBranch.checkout.transaction.isInProgress() === true) {
				return;
			}

			baseBranch.merge(forkedBranch, false);

			const updatedClientForkedViews = clientForkedViews.filter(
				(_, index) => index !== forkBranchIndex,
			);
			if (branchEdit.contents.baseBranch !== undefined) {
				updatedClientForkedViews.push(baseBranch);
			}
			forkedViews.set(state.client.channel, updatedClientForkedViews);
			state.forkedViews = forkedViews;
			break;
		}
		default:
			break;
	}
}

/**
 * Assumes tree is using the fuzzSchema.
 * TODO: Maybe take in a schema aware strongly typed Tree node or field.
 */
export function applyFieldEdit(tree: FuzzView, fieldEdit: FieldEdit): void {
	const parentNode = fieldEdit.parentNodePath
		? (navigateToNode(tree, fieldEdit.parentNodePath) ?? tree.root)
		: tree.root;

	if (!Tree.is(parentNode, tree.currentSchema)) {
		assert(fieldEdit.change.type === "optional");
		switch (fieldEdit.change.edit.type) {
			case "set": {
				tree.root = generateFuzzNode(fieldEdit.change.edit.value, tree.currentSchema);
				break;
			}
			case "clear": {
				tree.root = undefined;
				break;
			}
			default:
				fail("Invalid edit.");
		}
		return;
	}
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
				generateFuzzNode(value, tree.currentSchema),
			);
			parentNode.arrayChildren.insertAt(change.index, TreeArrayNode.spread(insertValues));
			break;
		}
		case "remove": {
			parentNode.arrayChildren.removeRange(change.range.first, change.range.last + 1);
			break;
		}
		case "intraFieldMove": {
			parentNode.arrayChildren.moveRangeToIndex(
				change.dstIndex,
				change.range.first,
				change.range.last + 1,
			);
			break;
		}
		case "crossFieldMove": {
			const dstParentNode = change.dstParent
				? navigateToNode(tree, change.dstParent)
				: tree.root;
			assert(Tree.is(dstParentNode, tree.currentSchema));
			dstParentNode.arrayChildren.moveRangeToIndex(
				change.dstIndex,
				change.range.first,
				change.range.last + 1,
				parentNode.arrayChildren,
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
			parentNode.requiredChild = generateFuzzNode(change.value, tree.currentSchema);
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
			parentNode.optionalChild = generateFuzzNode(change.value, tree.currentSchema);
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
		const treeView = viewFromState(state);
		const treeSchema = treeView.currentSchema;
		const treeViewFork = treeView.fork();

		view = treeViewFork as FuzzTransactionView;
		view.currentSchema = treeSchema ?? assert.fail("nodeSchema should not be undefined");
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

	if (!checkout.transaction.isInProgress()) {
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
			const constraintNode = constraint.content.nodePath
				? navigateToNode(tree, constraint.content.nodePath)
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

function navigateToNode(tree: FuzzView, path: DownPath): TreeNode {
	let currentNode = tree.root as TreeNode;
	for (const pathStep of path) {
		switch (pathStep.field) {
			case "rootFieldKey":
				break;
			case "":
				assert(pathStep.index !== undefined);
				currentNode = (currentNode as ArrayChildren).at(pathStep.index) as TreeNode;
				break;
			case "arrayChildren": {
				const arrayChildren =
					(currentNode as FuzzNode).arrayChildren ??
					fail(`Unexpected field type: ${pathStep.field}`);

				currentNode = arrayChildren;
				break;
			}

			case "optionalChild": {
				const optionalChild =
					(currentNode as FuzzNode).optionalChild ??
					fail(`Unexpected field type: ${pathStep.field}`);
				currentNode = optionalChild as FuzzNode;
				break;
			}
			case "requiredChild": {
				const requiredChild =
					(currentNode as FuzzNode).requiredChild ??
					fail(`Unexpected field type: ${pathStep.field}`);
				currentNode = requiredChild as FuzzNode;
				break;
			}
			default:
				fail(`Unexpected field type: ${pathStep.field}`);
		}
	}

	return currentNode;
}

function nodeSchemaForNodeType(nodeSchema: typeof FuzzNode, nodeType: string) {
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

function generateFuzzNode(node: GeneratedFuzzNode, nodeSchema: typeof FuzzNode) {
	switch (node.type) {
		case GeneratedFuzzValueType.String:
			return node.value as string;
		case GeneratedFuzzValueType.Number:
			return node.value as number;
		case GeneratedFuzzValueType.Handle:
			return node.value as IFluidHandle;
		case GeneratedFuzzValueType.NodeObject: {
			const nodeObjectSchema = nodeSchemaForNodeType(nodeSchema, "treeFuzz.node");
			return new nodeObjectSchema({
				requiredChild: (node.value as NodeObjectValue).requiredChild,
				arrayChildren: [],
			}) as FuzzNode;
		}
		case GeneratedFuzzValueType.GUIDNode: {
			const guid = (node.value as GUIDNodeValue).guid;
			const nodeObjectSchema = nodeSchemaForNodeType(nodeSchema, guid);
			return new nodeObjectSchema({
				value: guid,
			}) as GUIDNode;
		}
		default:
			unreachableCase(node.type, "invalid GeneratedFuzzNode");
	}
}
