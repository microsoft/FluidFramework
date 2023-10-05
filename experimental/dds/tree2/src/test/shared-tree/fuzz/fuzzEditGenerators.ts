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
	BaseFuzzTestState,
} from "@fluid-internal/stochastic-test-utils";
import { DDSFuzzTestState } from "@fluid-internal/test-dds-utils";
import { ISharedTreeView, SharedTreeFactory } from "../../../shared-tree";
import { brand, fail } from "../../../util";
import { FieldKey, FieldUpPath, JsonableTree, UpPath } from "../../../core";
import { DownPath, TreeNode, toDownPath } from "../../../feature-libraries";
import {
	FieldEditTypes,
	FuzzInsert,
	FuzzSet,
	FuzzTransactionType,
	FuzzUndoRedoType,
	Operation,
	RedoOp,
	Synchronize,
	TransactionAbortOp,
	TransactionBoundary,
	TransactionCommitOp,
	TransactionStartOp,
	TreeEdit,
	UndoOp,
	UndoRedo,
} from "./operationTypes";
import { FuzzNode, fuzzNode, getEditableTree } from "./fuzzUtils";

export type FuzzTestState = DDSFuzzTestState<SharedTreeFactory>;

/**
 * When performing an operation, a random field must be selected. Rather than enumerate all fields of the tree, this is
 * performed recursively starting at the root field.
 *
 * When a field needs to be selected, the fuzz test generator walks down the tree from the root field, randomly selecting
 * one of the below options. If the selected option is not valid (e.g. the field is empty and the generator is trying to
 * select a node to delete), field selection will automatically re-sample excluding this option.
 *
 * Each weight is used throughout the field selection process.
 *
 * @remarks
 * Allowing more than just numbers here could be interesting. E.g. `(depth: number) => number` to allow biasing away from
 * changing the root field for more interesting merge outcomes.
 *
 * Alternatively, we might be able to accomplish similar goals by exposing field filtering to the caller.
 */
export interface FieldSelectionWeights {
	/**
	 * Select the current Fuzz node's "optionalF" field
	 */
	optional: number;
	/**
	 * Select the current Fuzz node's "requiredF" field
	 */
	value: number;
	/**
	 * Select the current Fuzz node's "sequenceF" field
	 */
	sequence: number;
	/**
	 * Select a direct child of the current Fuzz node, uniformly at random
	 */
	recurse: number;
}

const defaultFieldSelectionWeights: FieldSelectionWeights = {
	optional: 1,
	value: 1,
	sequence: 1,
	recurse: 4,
};

export interface EditGeneratorOpWeights {
	insert: number;
	delete: number;
	start: number;
	commit: number;
	abort: number;
	undo: number;
	redo: number;
	// This is explicitly all-or-nothing. If changing to be partially specifiable, the override logic to apply default values
	// needs to be updated since this is a nested object.
	fieldSelection: FieldSelectionWeights;
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
	fieldSelection: defaultFieldSelectionWeights,
	synchronizeTrees: 0,
};

export interface EditGeneratorOptions {
	weights: Partial<EditGeneratorOpWeights>;
	maxDeleteCount: number;
}

export const makeEditGenerator = (
	opWeightsArg: Partial<EditGeneratorOpWeights>,
): Generator<TreeEdit, FuzzTestState> => {
	const weights = {
		...defaultEditGeneratorOpWeights,
		...opWeightsArg,
	};

	const jsonableTree = (state: FuzzTestState): JsonableTree => {
		// Heuristics around what type of tree we insert could be made customizable to tend toward trees of certain characteristics.
		return state.random.bool(0.3)
			? {
					type: brand("com.fluidframework.leaf.number"),
					value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			  }
			: {
					type: brand("Fuzz node"),
					fields: {
						requiredF: [
							{
								type: brand("com.fluidframework.leaf.number"),
								value: state.random.integer(
									Number.MIN_SAFE_INTEGER,
									Number.MAX_SAFE_INTEGER,
								),
							},
						],
					},
			  };
	};

	const insert = (state: FuzzTestState): FieldEditTypes => {
		const tree = state.client.channel;
		const fieldInfo = selectTreeField(tree.view, state.random, weights.fieldSelection);
		switch (fieldInfo.type) {
			case "optional":
			case "value": {
				const { type: fieldType, content: field } = fieldInfo;
				const contents: FuzzSet = {
					type: "set",
					parent: maybeDownPathFromNode(field.parent),
					key: field.key,
					value: jsonableTree(state),
				};
				return {
					type: fieldType,
					edit: contents,
				};
			}
			case "sequence": {
				const { content: field } = fieldInfo;
				const contents: FuzzInsert = {
					type: "insert",
					parent: maybeDownPathFromNode(field.parent),
					key: field.key,
					index: state.random.integer(0, field.length),
					value: jsonableTree(state),
				};
				return {
					type: "sequence",
					edit: contents,
				};
			}
			default:
				fail(`Invalid field type: ${(fieldInfo as { type: unknown }).type}`);
		}
	};

	const deletableFieldFilter: FieldFilter = (fieldInfo) =>
		isNonEmptyField(fieldInfo) && fieldInfo.type !== "value";

	const deleteContent = (state: FuzzTestState): FieldEditTypes => {
		const tree = state.client.channel;
		const fieldInfo = selectTreeField(
			tree.view,
			state.random,
			weights.fieldSelection,
			deletableFieldFilter,
		);
		switch (fieldInfo.type) {
			case "optional": {
				const { content: field } = fieldInfo;
				const { content } = field;
				// Note: if we ever decide to generate deletes for currently empty optional fields, the logic
				// in the reducer needs to be adjusted (it hard-codes `wasEmpty` to `false`).
				assert(
					content !== undefined,
					"Optional field should have content for it to be selected for deletion",
				);

				return {
					type: "optional",
					edit: {
						type: "delete",
						firstNode: downPathFromNode(content),
						count: 1,
					},
				};
			}
			case "sequence": {
				const { content: field } = fieldInfo;

				assert(
					field.length > 0,
					"Sequence field should have content for it to be selected for deletion",
				);
				const start = state.random.integer(0, field.length - 1);
				// It'd be reasonable to move this to config. The idea is that by avoiding large deletions,
				// we're more likely to generate more interesting outcomes.
				const count = state.random.integer(1, Math.min(3, field.length - start));
				return {
					type: "sequence",
					edit: {
						type: "delete",
						firstNode: downPathFromNode(field.at(start)),
						count,
					},
				};
			}
			default:
				fail(`Invalid field type for deletion of content: ${fieldInfo.type}`);
		}
	};

	const fieldEdit = createWeightedGenerator<FieldEditTypes, FuzzTestState>([
		[insert, weights.insert],
		[
			deleteContent,
			weights.delete,
			({ client, random }) =>
				trySelectTreeField(
					client.channel.view,
					random,
					weights.fieldSelection,
					deletableFieldFilter,
				) !== "no-valid-fields",
		],
	]);

	return (state) => {
		const change = fieldEdit(state);
		return change === done
			? done
			: {
					type: "edit",
					contents: {
						type: "fieldEdit",
						change,
					},
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
	weightsArg: Partial<EditGeneratorOpWeights> = defaultEditGeneratorOpWeights,
): AsyncGenerator<Operation, DDSFuzzTestState<SharedTreeFactory>> {
	const weights = {
		...defaultEditGeneratorOpWeights,
		...weightsArg,
	};
	// note: 'delete' is a JS keyword so isn't shorthanded in this destructure.
	const { insert, abort, commit, start, undo, redo } = weights;
	const editWeight = sumWeights([weights.delete, insert]);
	const transactionWeight = sumWeights([abort, commit, start]);
	const undoRedoWeight = sumWeights([undo, redo]);

	const syncGenerator = createWeightedGenerator<Operation, FuzzTestState>(
		(
			[
				[() => makeEditGenerator(weights), editWeight],
				[() => makeTransactionEditGenerator(weights), transactionWeight],
				[() => makeUndoRedoEditGenerator(weights), undoRedoWeight],
				[
					(): Synchronize => ({
						type: "synchronizeTrees",
					}),
					weights.synchronizeTrees,
				],
			] as const
		)
			.filter(([, weight]) => weight > 0)
			.map(([f, weight]) => [f(), weight]),
	);
	return async (state) => {
		return syncGenerator(state);
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

export interface FieldPathWithCount {
	fieldPath: FieldUpPath;
	fieldKey: FieldKey;
	count: number;
}

function upPathFromNode(node: TreeNode): UpPath {
	const parentField = node.parentField.parent;

	return {
		parent: parentField.parent ? upPathFromNode(parentField.parent) : undefined,
		parentField: parentField.key,
		parentIndex: node.parentField.index,
	};
}

function downPathFromNode(node: TreeNode): DownPath {
	return toDownPath(upPathFromNode(node));
}

function maybeDownPathFromNode(node: TreeNode | undefined): DownPath | undefined {
	return node === undefined ? undefined : downPathFromNode(node);
}

type FuzzField =
	| {
			type: "optional";
			content: FuzzNode["boxedOptionalF"];
	  }
	| {
			type: "sequence";
			content: FuzzNode["boxedSequenceF"];
	  }
	| {
			type: "value";
			content: FuzzNode["boxedRequiredF"];
	  };

type FieldFilter = (field: FuzzField) => boolean;

const isNonEmptyField: FieldFilter = (field) =>
	field.content !== undefined && (field.type !== "sequence" || field.content.length > 0);

function selectField(
	node: FuzzNode,
	random: IRandom,
	weights: FieldSelectionWeights,
	filter: FieldFilter = () => true,
): FuzzField | "no-valid-fields" {
	const alreadyPickedOptions = new Set<string>();
	const optional = (): FuzzField | "no-valid-fields" => {
		const field = { type: "optional", content: node.boxedOptionalF } as const;
		if (filter(field)) {
			return field;
		} else {
			alreadyPickedOptions.add("optional");
			return "no-valid-fields";
		}
	};

	const value = (): FuzzField | "no-valid-fields" => {
		const field = { type: "value", content: node.boxedRequiredF } as const;
		if (filter(field)) {
			return field;
		} else {
			alreadyPickedOptions.add("value");
			return "no-valid-fields";
		}
	};

	const sequence = (): FuzzField | "no-valid-fields" => {
		const field = { type: "sequence", content: node.boxedSequenceF } as const;
		if (filter(field)) {
			return field;
		} else {
			alreadyPickedOptions.add("sequence");
			return "no-valid-fields";
		}
	};

	const recurse = (state: { random: IRandom }): FuzzField | "no-valid-fields" => {
		const childNodes: FuzzNode[] = [];
		// Checking "=== true" causes tsc to fail to typecheck, as it is no longer able to narrow according
		// to the .is typeguard.
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (node.optionalF?.is(fuzzNode)) {
			childNodes.push(node.optionalF);
		}

		if (node.requiredF?.is(fuzzNode)) {
			childNodes.push(node.requiredF);
		}
		node.sequenceF.map((child) => {
			if (child.is(fuzzNode)) {
				childNodes.push(child);
			}
		});
		state.random.shuffle(childNodes);
		for (const child of childNodes) {
			const childResult = selectField(child, random, weights, filter);
			if (childResult !== "no-valid-fields") {
				return childResult;
			}
		}
		alreadyPickedOptions.add("child");
		return "no-valid-fields";
	};

	// If the test author passed any weights of 0, we don't want to rerun the below generator repeatedly when it will never
	const weightsArray = [weights.optional, weights.value, weights.sequence, weights.recurse];
	const nonZeroWeights = weightsArray.filter((weight) => weight > 0);
	const hasNotAlreadySelected = (name: string) => () => !alreadyPickedOptions.has(name);
	const generator = createWeightedGenerator<FuzzField | "no-valid-fields", BaseFuzzTestState>([
		[optional, weights.optional, hasNotAlreadySelected("optional")],
		[value, weights.value, hasNotAlreadySelected("value")],
		[sequence, weights.sequence, hasNotAlreadySelected("sequence")],
		[recurse, weights.recurse, hasNotAlreadySelected("child")],
		[
			"no-valid-fields",
			// Give this a reasonable chance of occurring. Ideally we'd have a little more control over the control flow here.
			sumWeights(weightsArray) / 4,
			() => alreadyPickedOptions.size === nonZeroWeights.length,
		],
	]);
	let result: FuzzField | "no-valid-fields" | typeof done = "no-valid-fields";
	do {
		result = generator({ random });
		assert(result !== done, "createWeightedGenerators should never return done");
	} while (result === "no-valid-fields" && alreadyPickedOptions.size < 4);
	return result;
}

function trySelectTreeField(
	tree: ISharedTreeView,
	random: IRandom,
	weights: FieldSelectionWeights,
	filter: FieldFilter = () => true,
): FuzzField | "no-valid-fields" {
	const editable = getEditableTree(tree);
	const options =
		weights.optional === 0
			? ["recurse"]
			: weights.recurse === 0
			? ["optional"]
			: random.bool(weights.optional / (weights.optional + weights.recurse))
			? ["optional", "recurse"]
			: ["recurse", "optional"];

	for (const option of options) {
		switch (option) {
			case "optional": {
				// Note: 'as const' here doesn't work since optional field allowing only FuzzNodes isn't assignable to
				// optional field allowing that plus primitives.
				// This is because of the presence of mutation methods on the optional field which shouldn't be called
				// by reasonable generator filters.
				const field = { type: "optional", content: editable } as unknown as FuzzField;
				if (filter(field)) {
					return field;
				}
				break;
			}
			case "recurse": {
				// Checking "=== true" causes tsc to fail to typecheck, as it is no longer able to narrow according
				// to the .is typeguard.
				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
				if (editable.content?.is(fuzzNode)) {
					const result = selectField(editable.content, random, weights, filter);
					if (result !== "no-valid-fields") {
						return result;
					}
				}

				break;
			}
			default:
				fail(`Invalid option: ${option}`);
		}
	}

	return "no-valid-fields";
}

function selectTreeField(
	tree: ISharedTreeView,
	random: IRandom,
	weights: FieldSelectionWeights,
	filter: FieldFilter = () => true,
): FuzzField {
	const result = trySelectTreeField(tree, random, weights, filter);
	assert(result !== "no-valid-fields", "No valid fields found");
	return result;
}

function transactionsInProgress(tree: ISharedTreeView) {
	return tree.transaction.inProgress();
}
