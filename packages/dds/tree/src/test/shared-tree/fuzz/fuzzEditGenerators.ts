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
	Weights,
} from "@fluid-private/stochastic-test-utils";
import { Client, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import {
	FlexTreeView,
	SharedTreeFactory,
	TreeContent,
	ITreeViewFork,
	SharedTree,
	ISharedTree,
} from "../../../shared-tree/index.js";
import { brand, fail, getOrCreate } from "../../../util/index.js";
import {
	AllowedUpdateType,
	FieldKey,
	FieldUpPath,
	JsonableTree,
	UpPath,
} from "../../../core/index.js";
import { DownPath, FlexTreeNode, toDownPath } from "../../../feature-libraries/index.js";
import { schematizeFlexTree } from "../../utils.js";
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
} from "./operationTypes.js";
import { FuzzNode, FuzzNodeSchema, fuzzNode, fuzzSchema } from "./fuzzUtils.js";

export type FuzzView = FlexTreeView<typeof fuzzSchema.rootFieldSchema> & {
	/**
	 * This client's current stored schema, which dictates allowable edits that the client may perform.
	 * @remarks - The type of this field isn't totally correct, since the supported schema for fuzz nodes changes
	 * at runtime to support different primitives (this allows fuzz testing of schema changes).
	 * However, fuzz schemas always have the same field names, so schema-dependent
	 * APIs such as the tree reading API will work correctly anyway.
	 *
	 * TODO: The schema for each client should be properly updated if "afterSchemaChange" (or equivalent event) occurs
	 * once schema ops are supported.
	 */
	currentSchema: FuzzNodeSchema;
};

export type FuzzTransactionView = ITreeViewFork<typeof fuzzSchema.rootFieldSchema> & {
	/**
	 * This client's current stored schema, which dictates allowable edits that the client may perform.
	 * @remarks - The type of this field isn't totally correct, since the supported schema for fuzz nodes changes
	 * at runtime to support different primitives (this allows fuzz testing of schema changes).
	 * However, fuzz schemas always have the same field names, so schema-dependent
	 * APIs such as the tree reading API will work correctly anyway.
	 *
	 * TODO: The schema for each client should be properly updated if "afterSchemaChange" (or equivalent event) occurs
	 * once schema ops are supported.
	 */
	currentSchema: FuzzNodeSchema;
};

export interface FuzzTestState extends DDSFuzzTestState<SharedTreeFactory> {
	/**
	 * Schematized view of clients and their nodeSchemas. Created lazily by viewFromState.
	 *
	 * SharedTrees undergoing a transaction will have a forked view in {@link transactionViews} instead,
	 * which should be used in place of this view until the transaction is complete.
	 */
	view?: Map<SharedTree, FuzzView>;
	/**
	 * Schematized view of clients undergoing transactions with their nodeSchemas.
	 * Edits to this view are not visible to other clients until the transaction is closed.
	 *
	 * Maintaining a separate view here is necessary since async transactions are not supported on the root checkout,
	 * and the fuzz testing model only simulates async transactions.
	 */
	transactionViews?: Map<ISharedTree, FuzzTransactionView>;
}

export function viewFromState(
	state: FuzzTestState,
	client: Client<SharedTreeFactory> = state.client,
	initialTree: TreeContent<typeof fuzzSchema.rootFieldSchema>["initialTree"] = undefined,
): FuzzView {
	state.view ??= new Map();

	return (
		state.transactionViews?.get(client.channel) ??
		getOrCreate(state.view, client.channel as SharedTree, (tree) => {
			const flexView: FlexTreeView<typeof fuzzSchema.rootFieldSchema> = schematizeFlexTree(
				tree,
				{
					initialTree,
					schema: fuzzSchema,
					allowedSchemaModifications: AllowedUpdateType.Initialize,
				},
			);
			const fuzzView = flexView as FuzzView;
			assert.equal(fuzzView.currentSchema, undefined);
			fuzzView.currentSchema = fuzzNode;
			return fuzzView;
		})
	);
}

/**
 * When performing an operation, a random field must be selected. Rather than enumerate all fields of the tree, this is
 * performed recursively starting at the root field.
 *
 * When a field needs to be selected, the fuzz test generator walks down the tree from the root field, randomly selecting
 * one of the below options. If the selected option is not valid (e.g. the field is empty and the generator is trying to
 * select a node to remove), field selection will automatically re-sample excluding this option.
 *
 * Each weight is used throughout the field selection process.
 *
 * @remarks
 * Allowing more than just numbers here could be interesting. E.g. `(depth: number) => number` to allow biasing away from
 * changing the root field for more interesting merge outcomes. The `filter` parameter can already accomplish this, but is
 * a bit less efficient in doing so (it'd need to walk to the root repeatedly to compute depth)
 */
export interface FieldSelectionWeights {
	/**
	 * Select the current Fuzz node's "optionalChild" field
	 */
	optional: number;
	/**
	 * Select the current Fuzz node's "requiredChild" field
	 */
	required: number;
	/**
	 * Select the current Fuzz node's "sequenceChild" field
	 */
	sequence: number;
	/**
	 * Select a direct child of the current Fuzz node, uniformly at random
	 */
	recurse: number;

	/**
	 * Whether the selected field is acceptable for use.
	 *
	 * @remarks - This can be helpful for restricting tests to only use certain types of fields
	 */
	filter?: FieldFilter;
}

const defaultFieldSelectionWeights: FieldSelectionWeights = {
	optional: 1,
	required: 1,
	sequence: 1,
	recurse: 4,
	filter: () => true,
};

export interface EditGeneratorOpWeights {
	insert: number;
	remove: number;
	start: number;
	commit: number;
	abort: number;
	undo: number;
	redo: number;
	move: number;
	// This is explicitly all-or-nothing. If changing to be partially specifiable, the override logic to apply default values
	// needs to be updated since this is a nested object.
	fieldSelection: FieldSelectionWeights;
	synchronizeTrees: number;
}
const defaultEditGeneratorOpWeights: EditGeneratorOpWeights = {
	insert: 0,
	remove: 0,
	start: 0,
	commit: 0,
	abort: 0,
	undo: 0,
	redo: 0,
	move: 0,
	fieldSelection: defaultFieldSelectionWeights,
	synchronizeTrees: 0,
};

export interface EditGeneratorOptions {
	weights: Partial<EditGeneratorOpWeights>;
	maxRemoveCount: number;
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
					type: brand("tree2fuzz.node"),
					fields: {
						requiredChild: [
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
		const fieldInfo = selectTreeField(
			viewFromState(state),
			state.random,
			weights.fieldSelection,
			weights.fieldSelection.filter,
		);
		switch (fieldInfo.type) {
			case "optional":
			case "required": {
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
		isNonEmptyField(fieldInfo) &&
		fieldInfo.type !== "required" &&
		(weights.fieldSelection.filter?.(fieldInfo) ?? true);

	const removeContent = (state: FuzzTestState): FieldEditTypes => {
		const fieldInfo = selectTreeField(
			viewFromState(state),
			state.random,
			weights.fieldSelection,
			deletableFieldFilter,
		);
		switch (fieldInfo.type) {
			case "optional": {
				const { content: field } = fieldInfo;
				const { content } = field;
				// Note: if we ever decide to generate removals for currently empty optional fields, the logic
				// in the reducer needs to be adjusted (it hard-codes `wasEmpty` to `false`).
				assert(
					content !== undefined,
					"Optional field should have content for it to be selected for deletion",
				);

				return {
					type: "optional",
					edit: {
						type: "remove",
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
				const node = field.at(start);
				// We computed 'start' in a way that guarantees it's in-bounds, so at() shouldn't have returned undefined.
				assert(node !== undefined, "Tried to access a node that doesn't exist");
				return {
					type: "sequence",
					edit: {
						type: "remove",
						firstNode: downPathFromNode(node),
						count,
					},
				};
			}
			default:
				fail(`Invalid field type for deletion of content: ${fieldInfo.type}`);
		}
	};

	const move = (state: FuzzTestState): FieldEditTypes => {
		const tree = state.client.channel;
		const fieldInfo = selectTreeField(
			viewFromState(state),
			state.random,
			weights.fieldSelection,
			(f) => f.type === "sequence" && f.content.length > 0,
		);
		assert(fieldInfo.type === "sequence", "Move should only be performed on sequence fields");
		const { content: field } = fieldInfo;
		assert(field.length > 0, "Sequence must have at least one element to perform a move");

		const start = state.random.integer(0, field.length - 1);
		const count = state.random.integer(1, field.length - start);
		const dstIndex = state.random.integer(0, field.length);
		const node = field.at(start);
		assert(node !== undefined, "Node should be defined at chosen index");

		return {
			type: "sequence",
			edit: {
				type: "move",
				dstIndex,
				count,
				firstNode: downPathFromNode(node),
			},
		};
	};

	const fieldEdit = createWeightedGeneratorWithBailout<FieldEditTypes, FuzzTestState>([
		[
			insert,
			weights.insert,
			(state) =>
				trySelectTreeField(
					viewFromState(state),
					state.random,
					weights.fieldSelection,
					weights.fieldSelection.filter,
				) !== "no-valid-fields",
		],
		[
			removeContent,
			weights.remove,
			(state) =>
				trySelectTreeField(
					viewFromState(state),
					state.random,
					weights.fieldSelection,
					deletableFieldFilter,
				) !== "no-valid-fields",
		],
		[
			move,
			weights.move,
			(state) =>
				trySelectTreeField(
					viewFromState(state),
					state.random,
					weights.fieldSelection,
					(f) => f.type === "sequence" && f.content.length > 0,
				) !== "no-valid-fields",
		],
	]);

	return (state) => {
		const change = fieldEdit(state);
		// This assert is typically hit when restricting the features a fuzz test executes such that it can reach a state
		// where no edit is valid to generate. E.g. a fuzz test which can only create edits from within transactions but
		// can never start a transaction, or a fuzz test which can only edit sequence fields but the tree is empty (and
		// the root schema is an optional field).
		assert(
			change !== "no-valid-selections",
			"Unable to generate a valid field edit. This typically indicates a problematic fuzz test generator setup.",
		);
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
			(state) => viewFromState(state).checkout.transaction.inProgress(),
		],
		[
			abort,
			passedOpWeights.abort,
			(state) => viewFromState(state).checkout.transaction.inProgress(),
		],
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
	const { insert, remove, abort, commit, start, undo, redo } = weights;
	const editWeight = sumWeights([remove, insert]);
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

function upPathFromNode(node: FlexTreeNode): UpPath {
	const parentField = node.parentField.parent;

	return {
		parent: parentField.parent ? upPathFromNode(parentField.parent) : undefined,
		parentField: parentField.key,
		parentIndex: node.parentField.index,
	};
}

function downPathFromNode(node: FlexTreeNode): DownPath {
	return toDownPath(upPathFromNode(node));
}

function maybeDownPathFromNode(node: FlexTreeNode | undefined): DownPath | undefined {
	return node === undefined ? undefined : downPathFromNode(node);
}

type FuzzField =
	| {
			type: "optional";
			content: FuzzNode["boxedOptionalChild"];
	  }
	| {
			type: "sequence";
			content: FuzzNode["boxedSequenceChildren"];
	  }
	| {
			type: "required";
			content: FuzzNode["boxedRequiredChild"];
	  };

type FieldFilter = (field: FuzzField) => boolean;

const isNonEmptyField: FieldFilter = (field) =>
	field.content !== undefined &&
	((field.type === "sequence" && field.content.length > 0) ||
		(field.type !== "sequence" && field.content.content !== undefined));

function selectField(
	node: FuzzNode,
	random: IRandom,
	weights: Omit<FieldSelectionWeights, "filter">,
	filter: FieldFilter = () => true,
	nodeSchema: FuzzNodeSchema,
): FuzzField | "no-valid-selections" {
	const optional: FuzzField = { type: "optional", content: node.boxedOptionalChild } as const;

	const value: FuzzField = { type: "required", content: node.boxedRequiredChild } as const;

	const sequence: FuzzField = { type: "sequence", content: node.boxedSequenceChildren } as const;

	const recurse = (state: { random: IRandom }): FuzzField | "no-valid-selections" => {
		const childNodes: FuzzNode[] = [];
		// Checking "=== true" causes tsc to fail to typecheck, as it is no longer able to narrow according
		// to the .is typeguard.
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (node.optionalChild?.is(nodeSchema)) {
			childNodes.push(node.optionalChild);
		}

		if (node.requiredChild?.is(nodeSchema)) {
			childNodes.push(node.requiredChild);
		}
		node.sequenceChildren.map((child) => {
			if (child.is(nodeSchema)) {
				childNodes.push(child);
			}
		});
		state.random.shuffle(childNodes);
		for (const child of childNodes) {
			const childResult = selectField(child, random, weights, filter, nodeSchema);
			if (childResult !== "no-valid-selections") {
				return childResult;
			}
		}
		return "no-valid-selections";
	};

	const generator = createWeightedGeneratorWithBailout<FuzzField, BaseFuzzTestState>([
		[optional, weights.optional, () => filter(optional)],
		[value, weights.required, () => filter(value)],
		[sequence, weights.sequence, () => filter(sequence)],
		[recurse, weights.recurse],
	]);

	const result = generator({ random });
	assert(result !== done, "createWeightedGenerators should never return done");
	return result;
}

function trySelectTreeField(
	tree: FuzzView,
	random: IRandom,
	weights: Omit<FieldSelectionWeights, "filter">,
	filter: FieldFilter = () => true,
): FuzzField | "no-valid-fields" {
	const editable = tree.flexTree;
	const options =
		weights.optional === 0
			? ["recurse"]
			: weights.recurse === 0
			? ["optional"]
			: random.bool(weights.optional / (weights.optional + weights.recurse))
			? ["optional", "recurse"]
			: ["recurse", "optional"];
	const nodeSchema = tree.currentSchema;
	for (const option of options) {
		switch (option) {
			case "optional": {
				const field = { type: "optional", content: editable } as const;
				if (filter(field)) {
					return field;
				}
				break;
			}
			case "recurse": {
				// Checking "=== true" causes tsc to fail to typecheck, as it is no longer able to narrow according
				// to the .is typeguard.
				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
				if (editable.content?.is(nodeSchema)) {
					const result = selectField(
						editable.content,
						random,
						weights,
						filter,
						nodeSchema,
					);
					if (result !== "no-valid-selections") {
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
	tree: FuzzView,
	random: IRandom,
	weights: Omit<FieldSelectionWeights, "filter">,
	filter: FieldFilter = () => true,
): FuzzField {
	const result = trySelectTreeField(tree, random, weights, filter);
	assert(result !== "no-valid-fields", "No valid fields found");
	return result;
}

/**
 * Like `createWeightedGenerator`, except it will only attempt to select each option once.
 * If all options have been exhausted and no value other than 'no-valid-selections' is generated,
 * it will return 'no-valid-selections'.
 *
 * This helps prevent infinite loops for bad fuzz config.
 * Note: `T` cannot extend function, as otherwise `T | Generator<T>` cannot be distinguished.
 */
function createWeightedGeneratorWithBailout<T, TState extends BaseFuzzTestState>(
	weights: Weights<T | "no-valid-selections", TState>,
): Generator<T | "no-valid-selections", TState> {
	const nonzeroWeights = weights.filter(([, weight]) => weight > 0);
	const selectedIndices = new Set<number>();
	const newWeights: Weights<T, TState> = nonzeroWeights.map(
		([f, weight, acceptanceCondition], index) => [
			(state) => {
				selectedIndices.add(index);
				if (typeof f === "function") {
					const result = (f as Generator<T, TState>)(state);
					assert(
						typeof result !== "function",
						"Generator should not return a function: this prevents correct type deduction.",
					);
					return result;
				}
				return f as T;
			},
			weight,
			(state) => {
				if (selectedIndices.has(index)) {
					return false;
				}
				selectedIndices.add(index);
				return acceptanceCondition?.(state) !== false;
			},
		],
	);
	const generator = createWeightedGenerator<T | "no-valid-selections", TState>([
		...newWeights,
		[
			"no-valid-selections",
			// The weight here is arbitrary: we select one that will be selected a reasonable portion of the time.
			Math.max(
				1,
				sumWeights(nonzeroWeights.map(([, weight]) => weight)) / nonzeroWeights.length,
			),
			() => selectedIndices.size === nonzeroWeights.length,
		],
	]);

	return (state: TState) => {
		let result: T | "no-valid-selections" | typeof done = "no-valid-selections";
		do {
			result = generator(state);
			assert(result !== done, "createWeightedGenerators should never return done");
		} while (result === "no-valid-selections" && selectedIndices.size < nonzeroWeights.length);
		selectedIndices.clear();
		return result;
	};
}
