/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	AsyncGenerator,
	Generator,
	done,
	IRandom,
	createWeightedGenerator,
	Weights,
} from "@fluid-internal/stochastic-test-utils";
import { DDSFuzzTestState } from "@fluid-internal/test-dds-utils";
import { ISharedTreeView, SharedTreeFactory } from "../../../shared-tree";
import { brand, fail } from "../../../util";
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
	FuzzTransactionType,
	FuzzUndoRedoType,
	Operation,
	OptionalFieldEdit,
	RedoOp,
	SequenceFieldEdit,
	TransactionAbortOp,
	TransactionBoundary,
	TransactionCommitOp,
	TransactionStartOp,
	TreeEdit,
	UndoOp,
	UndoRedo,
	ValueFieldEdit,
} from "./operationTypes";

export type FuzzTestState = DDSFuzzTestState<SharedTreeFactory>;

export interface EditGeneratorOpWeights {
	insert: number;
	delete: number;
	start: number;
	commit: number;
	abort: number;
	undo: number;
	redo: number;
	synchronizeTrees: number;
}
const defaultEditGeneratorOpWeights: EditGeneratorOpWeights = {
	insert: 0,
	delete: 0,
	start: 0,
	commit: 0,
	abort: 0,
	undo: 0,
	redo: 0,
	synchronizeTrees: 0,
};

export const makeFieldEditGenerator = (
	opWeights: Partial<EditGeneratorOpWeights>,
): Generator<FieldEdit, FuzzTestState> => {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	function fieldEditGenerator(state: FuzzTestState): FieldEditTypes {
		const tree = state.client.channel;
		// generate edit for that specific tree
		const { fieldPath, fieldKey, count } = getExistingFieldPath(tree.view, state.random);
		assert(fieldPath.parent !== undefined);

		switch (fieldKey) {
			case sequenceFieldKey: {
				const opWeightRatio =
					passedOpWeights.insert / (passedOpWeights.delete + passedOpWeights.insert);
				const opType =
					count === 0 && state.random.bool(opWeightRatio) ? "insert" : "delete";
				switch (opType) {
					case "insert":
						return generateSequenceFieldInsertOp(
							fieldPath,
							fieldKey,
							state.random.integer(0, count),
							state.random,
						);
					case "delete":
						return generateSequenceFieldDeleteOp(fieldPath, state.random, count);
					default:
						break;
				}
			}
			case valueFieldKey: {
				return generateValueFieldDeleteOp(fieldPath);
			}
			case optionalFieldKey: {
				const opWeightRatio =
					passedOpWeights.insert / (passedOpWeights.delete + passedOpWeights.insert);
				const opType =
					count === 0 && state.random.bool(opWeightRatio) ? "insert" : "delete";
				switch (opType) {
					case "insert":
						return generateSequenceFieldInsertOp(
							fieldPath,
							fieldKey,
							state.random.integer(0, count),
							state.random,
						);
					case "delete":
						return generateOptionaFieldDeleteOp(fieldPath);
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
				);
		}
	}

	function generateDeleteEdit(
		fieldPath: FieldUpPath,
		count: number,
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
		};
	}

	function generateSequenceFieldDeleteOp(
		fieldPath: FieldUpPath,
		random: IRandom,
		count: number,
	): SequenceFieldEdit {
		const nodeIndex = random.integer(0, count - 1);
		const rangeSize = random.integer(1, count - nodeIndex);
		const contents = generateDeleteEdit(fieldPath, rangeSize, nodeIndex);
		return { type: "sequence", edit: contents };
	}

	function generateValueFieldDeleteOp(fieldPath: FieldUpPath): ValueFieldEdit {
		const contents = generateDeleteEdit(fieldPath, 1, 0);
		return { type: "value", edit: contents };
	}

	function generateOptionaFieldDeleteOp(fieldPath: FieldUpPath): OptionalFieldEdit {
		const contents = generateDeleteEdit(fieldPath, 1, 0);
		return { type: "optional", edit: contents };
	}

	function generateSequenceFieldInsertOp(
		fieldPath: FieldUpPath,
		fieldKey: FieldKey,
		fieldIndex: number,
		random: IRandom,
	): SequenceFieldEdit {
		const contents: FuzzInsert = {
			type: "insert",
			parent: fieldPath.parent,
			field: fieldKey,
			index: fieldIndex,
			value: random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
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
): Generator<TreeEdit, FuzzTestState> => {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	const fieldEdit = createWeightedGenerator<FieldEdit, FuzzTestState>([
		[
			makeFieldEditGenerator({
				insert: passedOpWeights.insert,
				delete: passedOpWeights.delete,
			}),
			sumWeights([passedOpWeights.delete, passedOpWeights.insert]),
			({ client }) => containsAtLeastOneNode(client.channel.view),
		],
	]);

	return (state) => {
		const contents = fieldEdit(state);
		return contents === done
			? done
			: {
					type: "edit",
					contents,
			  };
	};
};

export const makeTransactionEditGenerator = (
	opWeights: Partial<EditGeneratorOpWeights>,
): Generator<TransactionBoundary, FuzzTestState> => {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	const start: TransactionStartOp = { fuzzType: "transactionStart" };
	const commit: TransactionCommitOp = { fuzzType: "transactionCommit" };
	const abort: TransactionAbortOp = { fuzzType: "transactionAbort" };

	const transactionBoundaryType = createWeightedGenerator<FuzzTransactionType, FuzzTestState>([
		[start, passedOpWeights.start],
		[
			commit,
			passedOpWeights.commit,
			({ client }) => transactionsInProgress(client.channel.view),
		],
		[abort, passedOpWeights.abort, ({ client }) => transactionsInProgress(client.channel.view)],
	]);

	return (state) => {
		const contents = transactionBoundaryType(state);

		return contents === done
			? done
			: {
					type: "transaction",
					contents,
			  };
	};
};

export const makeUndoRedoEditGenerator = (
	opWeights: Partial<EditGeneratorOpWeights>,
): Generator<UndoRedo, FuzzTestState> => {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	const undo: UndoOp = { type: "undo" };
	const redo: RedoOp = { type: "redo" };

	const undoRedoType = createWeightedGenerator<FuzzUndoRedoType, FuzzTestState>([
		[undo, passedOpWeights.undo],
		[redo, passedOpWeights.redo],
	]);

	return (state) => {
		const contents = undoRedoType(state);

		return contents === done
			? done
			: {
					type: "undoRedo",
					contents,
			  };
	};
};

export function makeOpGenerator(
	opWeights: Partial<EditGeneratorOpWeights> = defaultEditGeneratorOpWeights,
): AsyncGenerator<Operation, DDSFuzzTestState<SharedTreeFactory>> {
	const passedOpWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeights,
	};
	const generatorWeights: Weights<Operation, FuzzTestState> = [];
	if (sumWeights([passedOpWeights.delete, passedOpWeights.insert]) > 0) {
		generatorWeights.push([
			makeEditGenerator(passedOpWeights),
			sumWeights([passedOpWeights.delete, passedOpWeights.insert]),
		]);
	}
	if (sumWeights([passedOpWeights.abort, passedOpWeights.commit, passedOpWeights.start]) > 0) {
		generatorWeights.push([
			makeTransactionEditGenerator(passedOpWeights),
			sumWeights([passedOpWeights.abort, passedOpWeights.commit, passedOpWeights.start]),
		]);
	}
	if (sumWeights([passedOpWeights.undo, passedOpWeights.redo]) > 0) {
		generatorWeights.push([
			makeUndoRedoEditGenerator(passedOpWeights),
			sumWeights([passedOpWeights.undo, passedOpWeights.redo]),
		]);
	}
	if (passedOpWeights.synchronizeTrees > 0) {
		generatorWeights.push([{ type: "synchronizeTrees" }, passedOpWeights.synchronizeTrees]);
	}
	const generatorAssumingTreeIsSelected = createWeightedGenerator<Operation, FuzzTestState>(
		generatorWeights,
	);
	return async (state) => {
		return generatorAssumingTreeIsSelected(state);
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
function getExistingFieldPath(tree: ISharedTreeView, random: IRandom): FieldPathWithCount {
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

function containsAtLeastOneNode(tree: ISharedTreeView): boolean {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	const firstNode = cursor.firstNode();
	cursor.free();
	return firstNode;
}

function transactionsInProgress(tree: ISharedTreeView) {
	return tree.transaction.inProgress();
}
