/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	AsyncGenerator,
	AsyncWeights,
	BaseFuzzTestState,
	createWeightedAsyncGenerator,
	done,
	IRandom,
} from "@fluid-internal/stochastic-test-utils";
import { ISharedTree } from "../../../shared-tree";
import { brand, fail } from "../../../util";
import { ITestTreeProvider } from "../../utils";
import {
	CursorLocationType,
	FieldKey,
	moveToDetachedField,
	rootFieldKeySymbol,
	UpPath,
} from "../../../core";

export type Operation = TreeOperation | Synchronize;

export type TreeOperation = TreeEdit | TransactionBoundary;

export interface TreeEdit {
	type: "edit";
	contents: FieldEdit | NodeEdit;
}

export interface Synchronize {
	type: "synchronize";
}

export interface TransactionBoundary {
	type: "transaction";
	contents: FuzzTransactionEdit;
	treeIndex: number;
}

export type FuzzFieldChange = FuzzInsert | FuzzDelete;

export interface FieldEdit {
	editType: "fieldEdit";
	change: SequenceFieldEdit;
}

export interface FuzzInsert {
	type: "insert";
	parent: UpPath | undefined;
	field: FieldKey;
	index: number;
	value: number;
	treeIndex: number;
}

export interface SequenceFieldEdit {
	type: "sequence";
	edit: FuzzInsert | FuzzDelete;
}

export interface FuzzDelete extends NodeRangePath {
	type: "delete";
	treeIndex: number;
}

export type FuzzNodeEditChange = FuzzSetPayload;

export interface NodeEdit {
	editType: "nodeEdit";
	edit: FuzzNodeEditChange;
}

export interface FuzzSetPayload {
	nodeEditType: "setPayload";
	path: UpPath;
	value: number;
	treeIndex: number;
}

export type FuzzTransactionEdit = TransactionStartOp | TransactionAbortOp | TransactionCommitOp;

export interface TransactionStartOp {
	fuzzType: "transactionStart";
}

export interface TransactionCommitOp {
	fuzzType: "transactionCommit";
}

export interface TransactionAbortOp {
	fuzzType: "transactionAbort";
}

export interface FuzzTestState extends BaseFuzzTestState {
	testTreeProvider: ITestTreeProvider;
	numberOfEdits: number;
}

export interface TreeContext {
	treeIndex: number;
}

export interface NodeRangePath {
	firstNode: UpPath;
	count: number;
}

export interface EditGeneratorOpWeights {
	insert?: number;
	delete?: number;
	setPayload?: number;
	start?: number;
	commit?: number;
	abort?: number;
	synchronize?: number;
}
const defaultEditGeneratorOpWeights = {
	insert: 5,
	delete: 1,
	setPayload: 1,
	start: 3,
	commit: 1,
	abort: 1,
	synchronize: 1,
};

export const makeInsertGenerator = (
	opWeights: EditGeneratorOpWeights = defaultEditGeneratorOpWeights,
): AsyncGenerator<FuzzInsert, FuzzTestState> => {
	type EditState = FuzzTestState & TreeContext;

	async function insertGenerator(state: EditState): Promise<FuzzInsert> {
		const trees = state.testTreeProvider.trees;
		const tree = trees[state.treeIndex];
		// generate edit for that specific tree
		const path: UpPath = getRandomPlace(tree, state.random);
		switch (path.parentField) {
			case sequenceFieldKey:
				return generateSequenceFieldInsertOp(path, state.random, state.treeIndex);
			default:
				// default case returns a sequence field edit for now.
				return generateSequenceFieldInsertOp(path, state.random, state.treeIndex);
		}
	}

	function generateSequenceFieldInsertOp(
		path: UpPath,
		random: IRandom,
		treeIndex: number,
	): FuzzInsert {
		return {
			type: "insert",
			parent: path.parent,
			field: path.parentField,
			index: path.parentIndex,
			value: random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			treeIndex,
		};
	}

	const baseInsertGenerator = createWeightedAsyncGenerator<FuzzInsert, EditState>([
		[insertGenerator, opWeights.insert ?? 0],
	]);

	const buildOperation = (contents: FuzzInsert) => {
		return contents;
	};

	return createAsyncGenerator<FuzzInsert, FuzzInsert>(baseInsertGenerator, buildOperation);
};

export const makeDeleteGenerator = (
	opWeights: EditGeneratorOpWeights = defaultEditGeneratorOpWeights,
): AsyncGenerator<FuzzDelete, FuzzTestState> => {
	type EditState = FuzzTestState & TreeContext;

	async function deleteGenerator(state: EditState): Promise<FuzzDelete> {
		const trees = state.testTreeProvider.trees;
		const tree = trees[state.treeIndex];
		// generate edit for that specific tree
		const { firstNode, count } = getExistingRandomNodeRangePath(tree, state.random);
		switch (firstNode.parentField) {
			case sequenceFieldKey:
				return generateSequenceFieldDeleteOp(firstNode, count, state.treeIndex);
			default:
				// default case returns a sequence field edit for now.
				return generateSequenceFieldDeleteOp(firstNode, count, state.treeIndex);
		}
	}

	function generateSequenceFieldDeleteOp(
		firstNode: UpPath,
		count: number,
		treeIndex: number,
	): FuzzDelete {
		return {
			type: "delete",
			firstNode,
			count,
			treeIndex,
		};
	}

	const baseDeleteGenerator = createWeightedAsyncGenerator<FuzzDelete, EditState>([
		[
			deleteGenerator,
			opWeights.delete ?? 0,
			({ testTreeProvider, treeIndex }) =>
				containsAtLeastOneNode(testTreeProvider.trees[treeIndex]),
		],
	]);

	const buildOperation = (contents: FuzzDelete) => {
		return contents;
	};

	return createAsyncGenerator<FuzzDelete, FuzzDelete>(baseDeleteGenerator, buildOperation);
};

export const makeNodeEditGenerator = (
	opWeights: EditGeneratorOpWeights = defaultEditGeneratorOpWeights,
): AsyncGenerator<NodeEdit, FuzzTestState> => {
	type EditState = FuzzTestState & TreeContext;

	async function setPayloadGenerator(state: EditState): Promise<FuzzSetPayload> {
		const trees = state.testTreeProvider.trees;
		const tree = trees[state.treeIndex];
		// generate edit for that specific tree
		const path = getExistingRandomNodePosition(tree, state.random);
		return {
			nodeEditType: "setPayload",
			path,
			value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			treeIndex: state.treeIndex,
		};
	}

	const baseNodeEditGenerator = createWeightedAsyncGenerator<FuzzNodeEditChange, EditState>([
		[
			setPayloadGenerator,
			opWeights.setPayload ?? 0,
			({ testTreeProvider, treeIndex }) =>
				containsAtLeastOneNode(testTreeProvider.trees[treeIndex]),
		],
	]);

	const buildOperation = (contents: FuzzNodeEditChange) => {
		const operation: NodeEdit = {
			editType: "nodeEdit",
			edit: contents,
		};
		return operation;
	};

	return createAsyncGenerator<FuzzNodeEditChange, NodeEdit>(
		baseNodeEditGenerator,
		buildOperation,
	);
};

export const makeSequenceFieldEditGenerator = (
	opWeights: EditGeneratorOpWeights = defaultEditGeneratorOpWeights,
): AsyncGenerator<SequenceFieldEdit, FuzzTestState> => {
	type EditState = FuzzTestState & TreeContext;

	const baseSequenceFieldEditGenerator = createWeightedAsyncGenerator<FuzzFieldChange, EditState>(
		[
			[
				makeDeleteGenerator(),
				opWeights.delete ?? 0,
				({ testTreeProvider, treeIndex }) =>
					containsAtLeastOneNode(testTreeProvider.trees[treeIndex]),
			],
			[makeInsertGenerator(), opWeights.insert ?? 0],
		],
	);

	const buildOperation = (contents: FuzzFieldChange) => {
		const operation: SequenceFieldEdit = {
			type: "sequence",
			edit: contents,
		};
		return operation;
	};

	return createAsyncGenerator<FuzzFieldChange, SequenceFieldEdit>(
		baseSequenceFieldEditGenerator,
		buildOperation,
	);
};

export const makeFieldEditGenerator = (
	opWeights: EditGeneratorOpWeights = defaultEditGeneratorOpWeights,
): AsyncGenerator<FieldEdit, FuzzTestState> => {
	type EditState = FuzzTestState & TreeContext;

	const baseFieldEditGenerator = createWeightedAsyncGenerator<SequenceFieldEdit, EditState>([
		[
			makeSequenceFieldEditGenerator(),
			sumWeights([opWeights.insert, opWeights.delete]),
			({ testTreeProvider, treeIndex }) =>
				containsAtLeastOneNode(testTreeProvider.trees[treeIndex]),
		],
	]);

	const buildOperation = (contents: SequenceFieldEdit) => {
		const operation: FieldEdit = {
			editType: "fieldEdit",
			change: contents,
		};
		return operation;
	};

	return createAsyncGenerator<SequenceFieldEdit, FieldEdit>(
		baseFieldEditGenerator,
		buildOperation,
	);
};

export const makeEditGenerator = (
	opWeights: EditGeneratorOpWeights = defaultEditGeneratorOpWeights,
): AsyncGenerator<TreeEdit, FuzzTestState> => {
	type EditState = FuzzTestState & TreeContext;
	const baseEditGenerator = createWeightedAsyncGenerator<FieldEdit | NodeEdit, EditState>([
		[
			makeFieldEditGenerator(),
			sumWeights([opWeights.delete, opWeights.insert]),
			// opWeights.insert ?? 0,
			({ testTreeProvider, treeIndex }) =>
				containsAtLeastOneNode(testTreeProvider.trees[treeIndex]),
		],
		[makeNodeEditGenerator(), opWeights.setPayload ?? 0],
	]);

	const buildOperation = (contents: FieldEdit | NodeEdit) => {
		const operation: TreeEdit = {
			type: "edit",
			contents,
		};
		return operation;
	};

	return createAsyncGenerator<FieldEdit | NodeEdit, TreeEdit>(baseEditGenerator, buildOperation);
};

export const makeTransactionEditGenerator = (
	opWeights: EditGeneratorOpWeights = defaultEditGeneratorOpWeights,
): AsyncGenerator<TransactionBoundary, FuzzTestState> => {
	type EditState = FuzzTestState & TreeContext;

	async function transactionStartGenerator(state: EditState): Promise<TransactionStartOp> {
		return {
			fuzzType: "transactionStart",
		};
	}

	async function transactionCommitGenerator(state: EditState): Promise<TransactionCommitOp> {
		return {
			fuzzType: "transactionCommit",
		};
	}

	async function transactionAbortGenerator(state: EditState): Promise<TransactionAbortOp> {
		return {
			fuzzType: "transactionAbort",
		};
	}

	const baseTransactionEditGenerator = createWeightedAsyncGenerator<
		FuzzTransactionEdit,
		EditState
	>([
		[transactionStartGenerator, opWeights.start ?? 0],
		[
			transactionCommitGenerator,
			opWeights.commit ?? 0,
			({ testTreeProvider, treeIndex }) =>
				transactionsInProgress(testTreeProvider.trees[treeIndex]),
		],
		[
			transactionAbortGenerator,
			0,
			// opWeights.abort ?? 0,
			({ testTreeProvider, treeIndex }) =>
				transactionsInProgress(testTreeProvider.trees[treeIndex]),
		],
	]);

	const buildOperation = (contents: FuzzTransactionEdit, treeIndex: number) => {
		const operation: TransactionBoundary = {
			type: "transaction",
			contents,
			treeIndex,
		};
		return operation;
	};

	return createAsyncGenerator<FuzzTransactionEdit, TransactionBoundary>(
		baseTransactionEditGenerator,
		buildOperation,
	);
};

function createAsyncGenerator<Op, OpOut>(
	baseGenerator: (state: FuzzTestState & TreeContext) => Promise<Op | typeof done>,
	buildOperation: (contents: Op, treeIndex: number) => OpOut,
): AsyncGenerator<OpOut, FuzzTestState> {
	return async (state: FuzzTestState): Promise<OpOut | typeof done> => {
		const trees = state.testTreeProvider.trees;
		// does not include last tree, as we want a passive client
		const treeIndex = trees.length === 1 ? 0 : state.random.integer(0, trees.length - 2);

		const contents = await baseGenerator({
			...state,
			treeIndex,
		});
		state.numberOfEdits += 1;
		if (contents === done) {
			return done;
		}
		return buildOperation(contents, treeIndex);
	};
}

export function makeOpGenerator(
	opWeights: EditGeneratorOpWeights = defaultEditGeneratorOpWeights,
): AsyncGenerator<Operation, FuzzTestState> {
	const generatorWeights: AsyncWeights<Operation, FuzzTestState> = [
		[
			makeEditGenerator(opWeights),
			sumWeights([opWeights.delete, opWeights.insert, opWeights.setPayload]),
		],
		[{ type: "synchronize" }, opWeights.synchronize ?? 0],
		[
			makeTransactionEditGenerator(opWeights),
			sumWeights([opWeights.abort, opWeights.commit, opWeights.start]),
		],
	];
	return createWeightedAsyncGenerator(generatorWeights);
}

function sumWeights(values: (number | undefined)[]): number {
	let sum = 0;
	for (const value of values) {
		if (value !== undefined) {
			sum += value;
		}
	}
	return sum;
}

const moves = {
	field: ["enterNode", "nextField"],
	nodes: ["stop", "firstField"],
};

const nodePlaceType = ["beforeNode", "afterNode", "belowNode"];

const sequenceFieldKey: FieldKey = brand("sequenceField");

function getRandomPlace(tree: ISharedTree, random: IRandom): UpPath {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	const firstNode = cursor.firstNode();
	if (!firstNode) {
		cursor.free();
		return { parent: undefined, parentField: rootFieldKeySymbol, parentIndex: 0 };
	}
	let currentPath = cursor.getPath();
	assert(currentPath !== undefined);
	const parentPath: UpPath = currentPath;
	const firstField = cursor.firstField();
	if (!firstField) {
		cursor.free();
		return { parent: parentPath, parentField: sequenceFieldKey, parentIndex: 0 };
	}
	currentPath = getExistingRandomNodePosition(tree, random);
	const choosePath = random.pick(nodePlaceType);
	switch (choosePath) {
		case "beforeNode":
			cursor.free();
			return parentPath;
		case "afterNode":
			cursor.free();
			return { ...parentPath, parentIndex: parentPath.parentIndex + 1 };
		case "belowNode":
			cursor.free();
			return { parent: parentPath, parentField: sequenceFieldKey, parentIndex: 0 };
		default:
			fail(`Unexpected option ${choosePath}`);
	}
}

function getExistingRandomNodePosition(tree: ISharedTree, random: IRandom): UpPath {
	const { firstNode: firstNodePath } = getExistingRandomNodeRangePath(tree, random);
	return firstNodePath;
}

function getExistingRandomNodeRangePath(tree: ISharedTree, random: IRandom): NodeRangePath {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	const firstNode = cursor.firstNode();
	assert(firstNode, "tree must contain at least one node");
	const firstPath = cursor.getPath();
	assert(firstPath !== undefined, "firstPath must be defined");
	let path: UpPath = firstPath;
	const firstField = cursor.firstField();
	if (!firstField) {
		// no fields, return the rootnode
		cursor.free();
		return { firstNode: path, count: 1 };
	}
	let fieldNodes: number = cursor.getFieldLength();
	let nodeIndex: number = 0;
	let rangeSize: number = 1;

	let currentMove = random.pick(moves.field);
	assert(cursor.mode === CursorLocationType.Fields);

	while (currentMove !== "stop") {
		switch (currentMove) {
			case "enterNode":
				if (fieldNodes > 0) {
					nodeIndex = random.integer(0, fieldNodes - 1);
					rangeSize = random.integer(1, fieldNodes - nodeIndex);
					cursor.enterNode(nodeIndex);
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					path = cursor.getPath()!;
					currentMove = random.pick(moves.nodes);
				} else {
					// if the node does not exist, return the most recently entered node
					cursor.free();
					return { firstNode: path, count: rangeSize };
				}
				break;
			case "firstField":
				if (cursor.firstField()) {
					currentMove = random.pick(moves.field);
					fieldNodes = cursor.getFieldLength();
				} else {
					currentMove = "stop";
				}
				break;
			case "nextField":
				if (cursor.nextField()) {
					currentMove = random.pick(moves.field);
					fieldNodes = cursor.getFieldLength();
				} else {
					currentMove = "stop";
				}
				break;
			default:
				fail(`Unexpected move ${currentMove}`);
		}
	}
	cursor.free();
	return { firstNode: path, count: rangeSize };
}

function containsAtLeastOneNode(tree: ISharedTree): boolean {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	const firstNode = cursor.firstNode();
	cursor.free();
	return firstNode;
}

function transactionsInProgress(tree: ISharedTree) {
	return tree.transaction.inProgress();
}
