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
import {
	CursorLocationType,
	FieldKey,
	FieldUpPath,
	JsonableTree,
	moveToDetachedField,
	UpPath,
} from "../../../core";
import {
	FieldEdit,
	FieldEditTypes,
	FuzzDelete,
	FuzzInsert,
	FuzzSet,
	FuzzTransactionType,
	FuzzUndoRedoType,
	Operation,
	OptionalFieldEdit,
	RedoOp,
	SequenceFieldEdit,
	Synchronize,
	TransactionAbortOp,
	TransactionBoundary,
	TransactionCommitOp,
	TransactionStartOp,
	TreeEdit,
	UndoOp,
	UndoRedo,
	ValueFieldEdit,
} from "./operationTypes";
import { FuzzNode, fuzzNode, fuzzSchema } from "./fuzzUtils";
import {
	FieldSchema,
	OptionalField,
	StructTyped,
	TreeField,
	TreeNode,
} from "../../../feature-libraries";
import { unreachableCase } from "@fluidframework/core-utils";

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

export const makeEditGenerator = (
	opWeightsArg: Partial<EditGeneratorOpWeights>,
): Generator<TreeEdit, FuzzTestState> => {
	const weights = {
		...defaultEditGeneratorOpWeights,
		...opWeightsArg,
	};

	const jsonableTree = (state: FuzzTestState): JsonableTree => {
		if (state.random.bool(0.3)) {
			return {
				type: brand("com.fluidframework.leaf.number"),
				value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			};
		} else {
			return {
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
		}
	};

	const insert = (state: FuzzTestState): FieldEditTypes => {
		const tree = state.client.channel;
		const fieldInfo = selectTreeField(tree.view, state.random);
		switch (fieldInfo.type) {
			case "optional":
			case "value": {
				const { type: fieldType, content: field } = fieldInfo;
				const contents: FuzzSet = {
					type: "set",
					fieldPath: fieldUpPathFromField(field),
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
					fieldPath: fieldUpPathFromField(field),
					index: state.random.integer(0, field.length),
					// TODO: generate insertion of multiple pieces of content at once
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
		const fieldInfo = selectTreeField(tree.view, state.random, deletableFieldFilter);
		switch (fieldInfo.type) {
			case "optional": {
				const { content: field } = fieldInfo;
				const { content } = field;
				assert(
					content !== undefined,
					"Optional field should have content for it to be selected for deletion",
				);

				return {
					type: "optional",
					edit: {
						type: "delete",
						firstNode: upPathFromNode(content),
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
				// TODO: Magic number here. Generally we want to limit deletions to be relatively small.
				const count = state.random.integer(1, Math.min(3, field.length - start));
				return {
					type: "sequence",
					edit: {
						type: "delete",
						firstNode: upPathFromNode(field.at(start)),
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
				trySelectTreeField(client.channel.view, random, deletableFieldFilter) !==
				"no-valid-fields",
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

function fieldUpPathFromField(field: TreeField): FieldUpPath {
	return {
		parent: field.parent ? upPathFromNode(field.parent) : undefined,
		field: field.key,
	};
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
	filter: FieldFilter = () => true,
): FuzzField | "no-valid-fields" {
	// TODO: could use same shuffle technique as below here.
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

	const child = (state: { random: IRandom }): FuzzField | "no-valid-fields" => {
		const childNodes: FuzzNode[] = [];
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
		random.shuffle(childNodes);
		for (const child of childNodes) {
			const result = selectField(child, random, filter);
			if (result !== "no-valid-fields") {
				return result;
			}
		}
		alreadyPickedOptions.add("child");
		return "no-valid-fields";
	};

	const hasNotAlreadySelected = (name: string) => () => !alreadyPickedOptions.has(name);
	const generator = createWeightedGenerator<FuzzField | "no-valid-fields", BaseFuzzTestState>([
		[optional, 1, hasNotAlreadySelected("optional")],
		[value, 1, hasNotAlreadySelected("value")],
		[sequence, 1, hasNotAlreadySelected("sequence")],
		[child, 4, hasNotAlreadySelected("child")],
		["no-valid-fields", 1, () => alreadyPickedOptions.size === 4],
	]);
	let result: FuzzField | "no-valid-fields" | typeof done = "no-valid-fields";
	do {
		result = generator({ random });
	} while (result === "no-valid-fields" && alreadyPickedOptions.size < 4);
	assert(result !== done, "createWeightedGenerators should never return done");
	return result;
	// do {
	// 	const fieldType = random.pick([...candidateSelections]);
	// 	switch (fieldType) {
	// 		case "optional": {
	// 			const field = { type: "optional", content: node.boxedOptionalF } as const;
	// 			if (filter(field)) {
	// 				return field;
	// 			} else {
	// 				candidateSelections.delete("optional");
	// 			}
	// 			break;
	// 		}
	// 		case "value": {
	// 			const field = { type: "value", content: node.boxedRequiredF } as const;
	// 			if (filter(field)) {
	// 				return field;
	// 			} else {
	// 				candidateSelections.delete("value");
	// 			}
	// 			break;
	// 		}
	// 		case "sequence": {
	// 			const field = { type: "sequence", content: node.boxedSequenceF } as const;
	// 			if (filter(field)) {
	// 				return field;
	// 			} else {
	// 				candidateSelections.delete("sequence");
	// 			}
	// 			break;
	// 		}
	// 		case "child": {
	// 			const childNodes: FuzzNode[] = [];
	// 			if (node.optionalF?.is(fuzzNode)) {
	// 				childNodes.push(node.optionalF);
	// 			}
	// 			if (node.requiredF?.is(fuzzNode)) {
	// 				childNodes.push(node.requiredF);
	// 			}
	// 			node.sequenceF.map((child) => {
	// 				if (child.is(fuzzNode)) {
	// 					childNodes.push(child);
	// 				}
	// 			});
	// 			random.shuffle(childNodes);
	// 			for (const child of childNodes) {
	// 				const result = selectField(child, random, filter);
	// 				if (result !== "no-valid-fields") {
	// 					return result;
	// 				}
	// 			}
	// 			candidateSelections.delete("child");
	// 			break;
	// 		}
	// 		default:
	// 			fail(`Unexpected field type ${fieldType}`);
	// 	}
	// } while (candidateSelections.size > 0);

	// return "no-valid-fields";
}

const cachedEditableTreeSymbol = Symbol();
const getEditableTree = (tree: ISharedTreeView) => {
	if ((tree as any)[cachedEditableTreeSymbol] === undefined) {
		(tree as any)[cachedEditableTreeSymbol] = tree.editableTree2(fuzzSchema);
	}

	return (tree as any)[cachedEditableTreeSymbol];
};

function trySelectTreeField(
	tree: ISharedTreeView,
	random: IRandom,
	filter: FieldFilter = () => true,
): FuzzField | "no-valid-fields" {
	// TODO: Type here should be specifiable without this.
	const foo = tree.editableTree2(fuzzSchema);
	const editable: typeof foo = getEditableTree(tree);
	const options = random.bool(0.1) ? ["root", "child"] : ["child", "root"];

	// const root = (): FuzzField | "no-valid-fields" => {
	// 	const field = { type: "value", content: node.boxedRequiredF } as const;
	// 	if (filter(field)) {
	// 		return field;
	// 	} else {
	// 		alreadyPickedOptions.add("value");
	// 		return "no-valid-fields";
	// 	}
	// };

	// const child = (): FuzzField | "no-valid-fields" => {
	// 	if (editable.content?.is(fuzzNode)) {
	// 		const result = selectField(editable.content, random, filter);
	// 		if (result !== "no-valid-fields") {
	// 			return result;
	// 		}
	// 	}
	// };

	// do {
	// 	result = generator({ random });
	// } while (result === "no-valid-fields" && alreadyPickedOptions.size < 4);
	// assert(result !== done, "createWeightedGenerators should never return done");
	// return result;

	for (const option of options) {
		switch (option) {
			case "root": {
				// TODO: 'as const' here doesn't work since optional field allowing only FuzzNodes isn't assignable to
				// optional field allowing that plus primitives.
				const field = { type: "optional", content: editable } as any;
				if (filter(field)) {
					return field;
				}
				break;
			}
			case "child": {
				if (editable.content?.is(fuzzNode)) {
					const result = selectField(editable.content, random, filter);
					if (result !== "no-valid-fields") {
						return result;
					}
				}

				break;
			}
		}
	}

	return "no-valid-fields";
}

function selectTreeField(
	tree: ISharedTreeView,
	random: IRandom,
	filter: FieldFilter = () => true,
): FuzzField {
	const result = trySelectTreeField(tree, random, filter);
	assert(result !== "no-valid-fields", "No valid fields found");
	return result;
}

function transactionsInProgress(tree: ISharedTreeView) {
	return tree.transaction.inProgress();
}
