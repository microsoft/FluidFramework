/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { promises as fs } from "fs";
import { strict as assert } from "assert";
import {
	AsyncGenerator,
	Generator,
	BaseFuzzTestState,
	done,
	IRandom,
	asyncGeneratorFromArray,
	createWeightedGenerator,
	Weights,
} from "@fluid-internal/stochastic-test-utils";
import { safelyParseJSON } from "@fluidframework/common-utils";
import { ISharedTree } from "../../../shared-tree";
import { brand, fail } from "../../../util";
import { ITestTreeProvider } from "../../utils";
import {
	CursorLocationType,
	FieldKey,
	FieldUpPath,
	moveToDetachedField,
	UpPath,
} from "../../../core";
import {
	FieldEdit,
	FieldEditTypes,
	FuzzDelete,
	FuzzInsert,
	FuzzNodeEditChange,
	FuzzSetPayload,
	FuzzTransactionType,
	NodeEdit,
	NodeRangePath,
	Operation,
	OptionalFieldEdit,
	SequenceFieldEdit,
	TransactionAbortOp,
	TransactionBoundary,
	TransactionCommitOp,
	TransactionStartOp,
	TreeEdit,
	ValueFieldEdit,
} from "./operationTypes";

export interface FuzzTestState extends BaseFuzzTestState {
	trees: readonly ISharedTree[];
	testTreeProvider?: ITestTreeProvider;
	numberOfEdits: number;
}

/**
 * Context for a 'selected tree'. This is useful at op generation time: most fuzz test operation generators
 * work by picking a tree to perform an operation on, and afterward deciding the operation to perform.
 *
 * Since generators are typically written hierarchically, it's important that this selection only happens once.
 * This type is useful to pass down as additional context to a generator's state.
 */
export interface TreeSelectionContext {
	/**
	 * Selected tree index.
	 */
	treeIndex: number;
	/**
	 * Selected tree.
	 */
	tree: ISharedTree;
}

export type EditState = FuzzTestState & TreeSelectionContext;

export interface EditGeneratorOpWeights {
	insert: number;
	delete: number;
	setPayload: number;
	start: number;
	commit: number;
	abort: number;
	synchronize: number;
}
const defaultEditGeneratorOpWeights: EditGeneratorOpWeights = {
	insert: 0,
	delete: 0,
	setPayload: 0,
	start: 0,
	commit: 0,
	abort: 0,
	synchronize: 0,
};

export const makeNodeEditGenerator = (): Generator<NodeEdit, EditState> => {
	function setPayloadGenerator(state: EditState): FuzzNodeEditChange {
		const trees = state.trees;
		const tree = trees[state.treeIndex];
		// generate edit for that specific tree
		const path = getExistingRandomNodePosition(tree, state.random);
		const setPayload: FuzzSetPayload = {
			nodeEditType: "setPayload",
			path,
			value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			treeIndex: state.treeIndex,
		};
		switch (path.parentField) {
			case sequenceFieldKey:
			default:
				return {
					type: "sequence",
					edit: setPayload,
				};
			case valueFieldKey:
				return {
					type: "value",
					edit: setPayload,
				};
			case optionalFieldKey:
				return {
					type: "optional",
					edit: setPayload,
				};
		}
	}

	return (state) => ({
		type: "nodeEdit",
		edit: setPayloadGenerator(state),
	});
};

export const makeFieldEditGenerator = (
	opWeights: Partial<EditGeneratorOpWeights>,
): Generator<FieldEdit, EditState> => {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	function fieldEditGenerator(state: EditState): FieldEditTypes {
		const trees = state.trees;
		const tree = trees[state.treeIndex];
		// generate edit for that specific tree
		const { fieldPath, fieldKey, count } = getExistingFieldPath(tree, state.random);
		assert(fieldPath.parent !== undefined);

		switch (fieldKey) {
			case sequenceFieldKey: {
				const opWeightRatio = passedOpWeights.insert / passedOpWeights.delete;
				const opType =
					count === 0 && state.random.bool(opWeightRatio) ? "insert" : "delete";
				switch (opType) {
					case "insert":
						return generateSequenceFieldInsertOp(
							fieldPath,
							fieldKey,
							state.random.integer(0, count),
							state.random,
							state.treeIndex,
						);
					case "delete":
						return generateSequenceFieldDeleteOp(
							fieldPath,
							state.random,
							count,
							state.treeIndex,
						);
					default:
						break;
				}
			}
			case valueFieldKey: {
				return generateValueFieldDeleteOp(fieldPath, state.treeIndex);
			}
			case optionalFieldKey: {
				const opWeightRatio = passedOpWeights.insert / passedOpWeights.delete;
				const opType =
					count === 0 && state.random.bool(opWeightRatio) ? "insert" : "delete";
				switch (opType) {
					case "insert":
						return generateSequenceFieldInsertOp(
							fieldPath,
							fieldKey,
							state.random.integer(0, count),
							state.random,
							state.treeIndex,
						);
					case "delete":
						return generateOptionaFieldDeleteOp(fieldPath, state.treeIndex);
					default:
						break;
				}
			}
			default:
				// default case returns a sequence field edit for now.
				return generateSequenceFieldInsertOp(
					fieldPath,
					fieldKey,
					state.random.integer(0, count),
					state.random,
					state.treeIndex,
				);
		}
	}

	function generateDeleteEdit(
		fieldPath: FieldUpPath,
		count: number,
		treeIndex: number,
		nodeIndex: number,
	): FuzzDelete {
		const firstNode: UpPath = {
			parent: fieldPath.parent,
			parentField: fieldPath.field,
			parentIndex: nodeIndex,
		};
		return {
			type: "delete",
			firstNode,
			count,
			treeIndex,
		};
	}

	function generateSequenceFieldDeleteOp(
		fieldPath: FieldUpPath,
		random: IRandom,
		count: number,
		treeIndex: number,
	): SequenceFieldEdit {
		const nodeIndex = random.integer(0, count - 1);
		const rangeSize = random.integer(1, count - nodeIndex);
		const contents = generateDeleteEdit(fieldPath, rangeSize, treeIndex, nodeIndex);
		return { type: "sequence", edit: contents };
	}

	function generateValueFieldDeleteOp(fieldPath: FieldUpPath, treeIndex: number): ValueFieldEdit {
		const contents = generateDeleteEdit(fieldPath, 1, treeIndex, 0);
		return { type: "value", edit: contents };
	}

	function generateOptionaFieldDeleteOp(
		fieldPath: FieldUpPath,
		treeIndex: number,
	): OptionalFieldEdit {
		const contents = generateDeleteEdit(fieldPath, 1, treeIndex, 0);
		return { type: "optional", edit: contents };
	}

	function generateSequenceFieldInsertOp(
		fieldPath: FieldUpPath,
		fieldKey: FieldKey,
		fieldIndex: number,
		random: IRandom,
		treeIndex: number,
	): SequenceFieldEdit {
		const contents: FuzzInsert = {
			type: "insert",
			parent: fieldPath.parent,
			field: fieldKey,
			index: fieldIndex,
			value: random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			treeIndex,
		};
		return {
			type: "sequence",
			edit: contents,
		};
	}

	return (state) => ({
		type: "fieldEdit",
		change: fieldEditGenerator(state),
	});
};

export const makeEditGenerator = (
	opWeights: Partial<EditGeneratorOpWeights>,
): Generator<TreeEdit, EditState> => {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	const fieldOrNodeEdit = createWeightedGenerator<FieldEdit | NodeEdit, EditState>([
		[
			makeFieldEditGenerator({
				insert: passedOpWeights.insert,
				delete: passedOpWeights.delete,
			}),
			sumWeights([passedOpWeights.delete, passedOpWeights.insert]),
			({ trees, treeIndex }) => containsAtLeastOneNode(trees[treeIndex]),
		],
		[
			makeNodeEditGenerator(),
			passedOpWeights.setPayload,
			({ trees, treeIndex }) => containsAtLeastOneNode(trees[treeIndex]),
		],
	]);

	return (state) => {
		const contents = fieldOrNodeEdit(state);
		return contents === done
			? done
			: {
					type: "edit",
					contents,
					index: state.treeIndex,
			  };
	};
};

export const makeTransactionEditGenerator = (
	opWeights: Partial<EditGeneratorOpWeights>,
): Generator<TransactionBoundary, EditState> => {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	const start: TransactionStartOp = { fuzzType: "transactionStart" };
	const commit: TransactionCommitOp = { fuzzType: "transactionCommit" };
	const abort: TransactionAbortOp = { fuzzType: "transactionAbort" };

	const transactionBoundaryType = createWeightedGenerator<FuzzTransactionType, EditState>([
		[start, passedOpWeights.start],
		[
			commit,
			passedOpWeights.commit,
			({ trees, treeIndex }) => transactionsInProgress(trees[treeIndex]),
		],
		[
			abort,
			passedOpWeights.abort,
			({ trees, treeIndex }) => transactionsInProgress(trees[treeIndex]),
		],
	]);

	return (state) => {
		const contents = transactionBoundaryType(state);

		return contents === done
			? done
			: {
					type: "transaction",
					contents,
					treeIndex: state.treeIndex,
			  };
	};
};

export function makeOpGenerator(
	opWeights: Partial<EditGeneratorOpWeights> = defaultEditGeneratorOpWeights,
): AsyncGenerator<Operation, FuzzTestState> {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	const generatorWeights: Weights<Operation, EditState> = [
		[
			makeEditGenerator(passedOpWeights),
			sumWeights([
				passedOpWeights.delete,
				passedOpWeights.insert,
				passedOpWeights.setPayload,
			]),
		],
		[{ type: "synchronize" }, passedOpWeights.synchronize],
		[
			makeTransactionEditGenerator(passedOpWeights),
			sumWeights([passedOpWeights.abort, passedOpWeights.commit, passedOpWeights.start]),
		],
	];

	const generatorAssumingTreeIsSelected = createWeightedGenerator<Operation, EditState>(
		generatorWeights,
	);
	return async (state) => {
		// Even though not all ops require a client (e.g. synchronize), selecting one won't hurt.
		// Centralizing this choice reduces boilerplate across nested generators and ensures all
		// generators agree which client to perform the operation on.
		// This selection doesn't include the last tree when there's mroe than one client, as having
		// a passive client to compare against is convenient.
		// TODO: If clients can join & leave mid-test, 'the last client' isn't stable with the natural
		// array operations.
		const treeIndex =
			state.trees.length === 1 ? 0 : state.random.integer(0, state.trees.length - 2);
		const tree = state.trees[treeIndex];
		return generatorAssumingTreeIsSelected({ ...state, treeIndex, tree });
	};
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

export async function makeOpGeneratorFromFilePath(
	filepath: string,
): Promise<AsyncGenerator<Operation, FuzzTestState>> {
	const savedOperationsStr = await fs.readFile(filepath, "utf-8");
	const operations: Operation[] = safelyParseJSON(savedOperationsStr) ?? [];
	return asyncGeneratorFromArray(operations);
}

const moves = {
	field: ["enterNode", "nextField"],
	nodes: ["stop", "firstField"],
};

const sequenceFieldKey: FieldKey = brand("sequenceField");
const valueFieldKey: FieldKey = brand("valueField");
const optionalFieldKey: FieldKey = brand("optionalField");

export interface FieldPathWithCount {
	fieldPath: FieldUpPath;
	fieldKey: FieldKey;
	count: number;
}

/**
 *
 * @param tree - tree to find path from
 * @param random - IRandom object to to generate random indices/values
 * @returns an existing path to a fieldPath with the number of nodes under that field.
 *
 * This function starts at the root of the tree, and traverses through the tree by selecting a
 * random move to perform every iteration (firstfield, nextfield, firstnode, nextnode, etc.)
 * Once the move 'stop' is picked, the fieldPath of the most recent valid cursor location is returned
 * TODO: provide the statistical properties of this function.
 */
function getExistingFieldPath(tree: ISharedTree, random: IRandom): FieldPathWithCount {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	const firstNode = cursor.firstNode();
	assert(firstNode, "tree must contain at least one node");
	const firstPath = cursor.getPath();
	assert(firstPath !== undefined, "firstPath must be defined");
	let path: UpPath = firstPath;
	const firstField = cursor.firstField();
	let currentField = cursor.getFieldKey();
	let currentFieldPath = cursor.getFieldPath();
	let fieldNodes: number = cursor.getFieldLength();
	if (!firstField) {
		// no fields, return the rootnode
		cursor.free();
		return {
			fieldPath: currentFieldPath,
			fieldKey: currentField,
			count: fieldNodes,
		};
	}
	currentField = cursor.getFieldKey();
	currentFieldPath = cursor.getFieldPath();
	fieldNodes = cursor.getFieldLength();
	let nodeIndex: number = 0;

	let currentMove = random.pick(moves.field);
	assert(cursor.mode === CursorLocationType.Fields);

	while (currentMove !== "stop") {
		switch (currentMove) {
			case "enterNode":
				if (fieldNodes > 0) {
					nodeIndex = random.integer(0, fieldNodes - 1);
					cursor.enterNode(nodeIndex);
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					path = cursor.getPath()!;
					currentMove = random.pick(moves.nodes);
				} else {
					// if the node does not exist, return the most recently entered node
					cursor.free();
					return {
						fieldPath: currentFieldPath,
						fieldKey: currentField,
						count: fieldNodes,
					};
				}
				break;
			case "firstField":
				if (cursor.firstField()) {
					currentMove = random.pick(moves.field);
					fieldNodes = cursor.getFieldLength();
					currentField = cursor.getFieldKey();
					currentFieldPath = cursor.getFieldPath();
				} else {
					currentMove = "stop";
				}
				break;
			case "nextField":
				if (cursor.nextField()) {
					currentMove = random.pick(moves.field);
					fieldNodes = cursor.getFieldLength();
					currentField = cursor.getFieldKey();
					currentFieldPath = cursor.getFieldPath();
				} else {
					currentMove = "stop";
				}
				break;
			default:
				fail(`Unexpected move ${currentMove}`);
		}
	}
	cursor.free();
	return {
		fieldPath: currentFieldPath,
		fieldKey: currentField,
		count: fieldNodes,
	};
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
