/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type AsyncGenerator,
	type BaseFuzzTestState,
	type Generator,
	type IRandom,
	type Weights,
	createWeightedGenerator,
	done,
} from "@fluid-private/stochastic-test-utils";
import type { Client, DDSFuzzTestState } from "@fluid-private/test-dds-utils";

import {
	AllowedUpdateType,
	type FieldKey,
	type FieldUpPath,
	type JsonableTree,
	type UpPath,
} from "../../../core/index.js";
import {
	type DownPath,
	type FlexTreeField,
	type FlexTreeNode,
	toDownPath,
	treeSchemaFromStoredSchema,
} from "../../../feature-libraries/index.js";
import type {
	FlexTreeView,
	ITreeViewFork,
	TreeContent,
	ISharedTree,
	SharedTree,
	SharedTreeFactory,
} from "../../../shared-tree/index.js";
import { brand, fail, getOrCreate, makeArray } from "../../../util/index.js";
import { schematizeFlexTree } from "../../utils.js";

import {
	type FuzzNode,
	type FuzzNodeSchema,
	type fuzzSchema,
	initialFuzzSchema,
} from "./fuzzUtils.js";
import type {
	Insert,
	Remove,
	SetField,
	IntraFieldMove,
	Operation,
	OptionalFieldEdit,
	RequiredFieldEdit,
	SchemaChange,
	SequenceFieldEdit,
	Synchronize,
	TransactionBoundary,
	TreeEdit,
	UndoRedo,
	FieldEdit,
	CrossFieldMove,
	FieldDownPath,
	Constraint,
} from "./operationTypes.js";

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
	const view =
		state.transactionViews?.get(client.channel) ??
		getOrCreate(state.view, client.channel, (tree) => {
			const treeSchema = treeSchemaFromStoredSchema(tree.storedSchema);
			const flexView: FlexTreeView<typeof fuzzSchema.rootFieldSchema> = schematizeFlexTree(
				tree,
				{
					initialTree,
					schema: isEmptyStoredSchema(tree) ? initialFuzzSchema : treeSchema,
					allowedSchemaModifications: AllowedUpdateType.Initialize,
				},
				() => {
					if (state.view?.get(tree) !== undefined) {
						state.view.delete(tree);
					}
				},
			) as unknown as FuzzView;

			const fuzzView = flexView as FuzzView;
			assert.equal(fuzzView.currentSchema, undefined);
			const nodeSchema = treeSchema.nodeSchema.get(brand("treefuzz.node")) as FuzzNodeSchema;
			fuzzView.currentSchema =
				nodeSchema ?? initialFuzzSchema.nodeSchema.get(brand("treefuzz.node"));
			return fuzzView;
		});
	return view;
}

function isEmptyStoredSchema(tree: SharedTree): boolean {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const rootFieldSchemaData = (tree.storedSchema as any).rootFieldSchemaData;
	return rootFieldSchemaData.types.size === 0;
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
	set: number;
	clear: number;
	insert: number;
	remove: number;
	intraFieldMove: number;
	crossFieldMove: number;
	start: number;
	commit: number;
	abort: number;
	undo: number;
	redo: number;
	// This is explicitly all-or-nothing. If changing to be partially specifiable, the override logic to apply default values
	// needs to be updated since this is a nested object.
	fieldSelection: FieldSelectionWeights;
	synchronizeTrees: number;
	schema: number;
	nodeConstraint: number;
}
const defaultEditGeneratorOpWeights: EditGeneratorOpWeights = {
	set: 0,
	clear: 0,
	insert: 0,
	remove: 0,
	intraFieldMove: 0,
	crossFieldMove: 0,
	start: 0,
	commit: 0,
	abort: 0,
	undo: 0,
	redo: 0,
	fieldSelection: defaultFieldSelectionWeights,
	synchronizeTrees: 0,
	schema: 0,
	nodeConstraint: 0,
};

export interface EditGeneratorOptions {
	weights: Partial<EditGeneratorOpWeights>;
	maxRemoveCount: number;
}

export function getAllowableNodeTypes(state: FuzzTestState) {
	const fuzzView = viewFromState(state);
	const nodeSchema = fuzzView.currentSchema;
	const nodeTypes = [];
	for (const leafNodeSchema of nodeSchema.info.optionalChild.allowedTypeSet) {
		if (typeof leafNodeSchema !== "string") {
			nodeTypes.push(leafNodeSchema.name);
		}
	}
	return nodeTypes;
}

export const makeTreeEditGenerator = (
	opWeightsArg: Partial<EditGeneratorOpWeights>,
): Generator<TreeEdit, FuzzTestState> => {
	const weights = {
		...defaultEditGeneratorOpWeights,
		...opWeightsArg,
	};

	const jsonableTree = (state: FuzzTestState): JsonableTree => {
		const allowableNodeTypes = getAllowableNodeTypes(state);
		const nodeTypeToGenerate = state.random.pick(allowableNodeTypes);

		switch (nodeTypeToGenerate) {
			case "com.fluidframework.leaf.number":
				return {
					type: brand("com.fluidframework.leaf.number"),
					value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
				};
			case "com.fluidframework.leaf.string":
				return {
					type: brand("com.fluidframework.leaf.string"),
					value: state.random
						.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
						.toString(),
				};
			case "com.fluidframework.leaf.handle":
				return {
					type: brand("com.fluidframework.leaf.handle"),
					value: state.random.handle(),
				};
			case "treefuzz.node":
				return {
					type: brand("treefuzz.node"),
					fields: {
						requiredChild: [
							{
								type: brand("com.fluidframework.leaf.number"),
								value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
							},
						],
					},
				};

			default:
				return {
					type: brand(nodeTypeToGenerate),
					value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
				};
		}
	};

	interface FuzzTestStateForFieldEdit<TFuzzField extends FuzzField = FuzzField>
		extends FuzzTestState {
		fieldInfo: TFuzzField;
	}

	const sequenceFieldEditGenerator = createWeightedGeneratorWithBailout<
		SequenceFieldEdit["edit"],
		FuzzTestStateForFieldEdit<SequenceFuzzField>
	>([
		[
			(state): Insert => ({
				type: "insert",
				index: state.random.integer(0, state.fieldInfo.content.length),
				content: makeArray(state.random.integer(1, 3), () => jsonableTree(state)),
			}),
			weights.insert,
		],
		[
			({ fieldInfo, random }): Remove => {
				const field = fieldInfo.content;
				const first = random.integer(0, field.length - 1);
				// By avoiding large deletions we're more likely to generate more interesting outcomes.
				// It'd be reasonable to move this to config.
				const last = random.integer(first, Math.min(first + 3, field.length - 1));
				return {
					type: "remove",
					range: { first, last },
				};
			},
			weights.remove,
			({ fieldInfo }) => fieldInfo.content.length > 0,
		],
		[
			({ fieldInfo, random }): IntraFieldMove => {
				const field = fieldInfo.content;
				const first = random.integer(0, field.length - 1);
				const last = random.integer(first, field.length - 1);
				return {
					type: "intraFieldMove",
					range: { first, last },
					dstIndex: random.integer(0, field.length),
				};
			},
			weights.intraFieldMove,
			({ fieldInfo }) => fieldInfo.content.length > 0,
		],
		[
			(state): CrossFieldMove => {
				const srcField = state.fieldInfo.content;
				const first = state.random.integer(0, srcField.length - 1);
				const last = state.random.integer(first, srcField.length - 1);
				const dstFieldInfo = selectTreeField(
					viewFromState(state),
					state.random,
					weights.fieldSelection,
					(field: FuzzField) =>
						field.type === "sequence" && !isField1UnderField2(field.content, srcField),
				);
				assert(dstFieldInfo.type === "sequence");
				const dstField = dstFieldInfo.content;
				return {
					type: "crossFieldMove",
					range: { first, last },
					dstField: fieldDownPathFromField(dstField),
					dstIndex: state.random.integer(0, dstField.length),
				};
			},
			weights.crossFieldMove,
			({ fieldInfo }) => fieldInfo.content.length > 0,
		],
	]);

	const optionalFieldEditGenerator = createWeightedGenerator<
		OptionalFieldEdit["edit"],
		FuzzTestStateForFieldEdit<OptionalFuzzField>
	>([
		[
			(state): SetField => ({
				type: "set",
				value: jsonableTree(state),
			}),
			weights.set,
		],
		[{ type: "clear" }, weights.clear, (state) => state.fieldInfo.content !== undefined],
	]);

	const requiredFieldEditGenerator = (
		state: FuzzTestStateForFieldEdit<RequiredFuzzField>,
	): RequiredFieldEdit["edit"] => ({
		type: "set",
		value: jsonableTree(state),
	});

	function fieldEditChangeGenerator(
		state: FuzzTestStateForFieldEdit,
	): FieldEdit["change"] | "no-valid-selections" {
		switch (state.fieldInfo.type) {
			case "sequence": {
				return mapBailout(
					assertNotDone(
						sequenceFieldEditGenerator(state as FuzzTestStateForFieldEdit<SequenceFuzzField>),
					),
					(edit) => ({ type: "sequence", edit }),
				);
			}
			case "optional":
				return {
					type: "optional",
					edit: assertNotDone(
						optionalFieldEditGenerator(state as FuzzTestStateForFieldEdit<OptionalFuzzField>),
					),
				};
			case "required":
				return {
					type: "required",
					edit: assertNotDone(
						requiredFieldEditGenerator(state as FuzzTestStateForFieldEdit<RequiredFuzzField>),
					),
				};
			default:
				fail("Unknown field type");
		}
	}

	return (state) => {
		let fieldInfo: FuzzField;
		let change: ReturnType<typeof fieldEditChangeGenerator>;
		// This could be surfaced as a config option if desired. In practice, the corresponding assert is most
		// likely to be hit during when a test is badly configured, in which case the remedy is to fix the config,
		// as opposed to increasing the number of attempts.
		let attemptsRemaining = 20;
		do {
			fieldInfo = selectTreeField(viewFromState(state), state.random, weights.fieldSelection);
			change = fieldEditChangeGenerator({ ...state, fieldInfo });
			attemptsRemaining -= 1;
		} while (change === "no-valid-selections" && attemptsRemaining > 0);
		assert(change !== "no-valid-selections", "No valid field edit found");
		return {
			type: "treeEdit",
			edit: {
				type: "fieldEdit",
				field: fieldDownPathFromField(fieldInfo.content),
				change,
			},
		};
	};
};

export const makeTransactionEditGenerator = (
	opWeightsArg: Partial<EditGeneratorOpWeights>,
): Generator<TransactionBoundary, FuzzTestState> => {
	const opWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeightsArg,
	};

	return createWeightedGenerator<TransactionBoundary, FuzzTestState>([
		[
			{
				type: "transactionBoundary",
				boundary: "start",
			},
			opWeights.start,
		],
		[
			{
				type: "transactionBoundary",
				boundary: "commit",
			},
			opWeights.commit,
			(state) => viewFromState(state).checkout.transaction.inProgress(),
		],
		[
			{
				type: "transactionBoundary",
				boundary: "abort",
			},
			opWeights.abort,
			(state) => viewFromState(state).checkout.transaction.inProgress(),
		],
	]);
};

export const schemaEditGenerator: Generator<SchemaChange, FuzzTestState> = (state) => ({
	type: "schemaChange",
	operation: { type: "schema", contents: { type: state.random.uuid4() } },
});

export const makeUndoRedoEditGenerator = (
	opWeightsArg: Partial<EditGeneratorOpWeights>,
): Generator<UndoRedo, FuzzTestState> => {
	const opWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeightsArg,
	};

	return createWeightedGenerator<UndoRedo, FuzzTestState>([
		[{ type: "undoRedo", operation: "undo" }, opWeights.undo],
		[{ type: "undoRedo", operation: "redo" }, opWeights.redo],
	]);
};

export const makeConstraintEditGenerator = (
	opWeightsArg: Partial<EditGeneratorOpWeights>,
): Generator<Constraint, FuzzTestState> => {
	const opWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeightsArg,
	};
	return createWeightedGenerator<Constraint, FuzzTestState>([
		[
			(state): Constraint => ({
				type: "constraint",
				content: {
					type: "nodeConstraint",
					path: maybeDownPathFromNode(
						// Selecting the parent node here, since the field is possibly empty.
						selectTreeField(viewFromState(state), state.random, opWeights.fieldSelection)
							.content.parent,
					),
				},
			}),
			opWeights.nodeConstraint,
		],
	]);
};

export function makeOpGenerator(
	weightsArg: Partial<EditGeneratorOpWeights> = defaultEditGeneratorOpWeights,
): AsyncGenerator<Operation, DDSFuzzTestState<SharedTreeFactory>> {
	const weights = {
		...defaultEditGeneratorOpWeights,
		...weightsArg,
	};
	const {
		insert,
		remove,
		intraFieldMove,
		crossFieldMove,
		set,
		clear,
		abort,
		commit,
		start,
		undo,
		redo,
		fieldSelection,
		schema,
		synchronizeTrees,
		nodeConstraint,
		...others
	} = weights;
	// This assert will trigger when new weights are added to EditGeneratorOpWeights but this function has not been
	// updated to take into account the new weights.
	assert(Object.keys(others).length === 0, "Unexpected weight");
	const editWeight = sumWeights([insert, remove, intraFieldMove, crossFieldMove, set, clear]);
	const transactionWeight = sumWeights([abort, commit, start]);
	const undoRedoWeight = sumWeights([undo, redo]);
	// Currently we only support node constraints, but this may be expanded in the future.
	const constraintWeight = nodeConstraint;

	const syncGenerator = createWeightedGenerator<Operation, FuzzTestState>(
		(
			[
				[() => makeTreeEditGenerator(weights), editWeight],
				[() => makeTransactionEditGenerator(weights), transactionWeight],
				[() => makeUndoRedoEditGenerator(weights), undoRedoWeight],
				[
					(): Synchronize => ({
						type: "synchronizeTrees",
					}),
					weights.synchronizeTrees,
				],
				[() => schemaEditGenerator, weights.schema],
				[
					() => makeConstraintEditGenerator(weights),
					constraintWeight,
					(state: FuzzTestState) => viewFromState(state).checkout.transaction.inProgress(),
				],
			] as const
		)
			.filter(([, weight]) => weight > 0)
			.map(([f, weight, acceptanceCriteria]) => [f(), weight, acceptanceCriteria]),
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

function isField1UnderField2(field1: FlexTreeField, field2: FlexTreeField): boolean {
	let parentField = field1.parent?.parentField?.parent;
	while (parentField !== undefined) {
		if (parentField.key === field2.key && parentField.parent === field2.parent) {
			return true;
		}
		parentField = parentField.parent?.parentField?.parent;
	}
	return false;
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

function fieldDownPathFromField(field: FlexTreeField): FieldDownPath {
	return {
		parent: maybeDownPathFromNode(field.parent),
		key: field.key,
	};
}

interface OptionalFuzzField {
	type: "optional";
	content: FuzzNode["boxedOptionalChild"];
}

interface SequenceFuzzField {
	type: "sequence";
	content: FuzzNode["boxedSequenceChildren"];
}

interface RequiredFuzzField {
	type: "required";
	content: FuzzNode["boxedRequiredChild"];
}

type FuzzField = OptionalFuzzField | SequenceFuzzField | RequiredFuzzField;

type FieldFilter = (field: FuzzField) => boolean;

function selectField(
	node: FuzzNode,
	random: IRandom,
	weights: Omit<FieldSelectionWeights, "filter">,
	filter: FieldFilter = () => true,
	nodeSchema: FuzzNodeSchema,
): FuzzField | "no-valid-selections" {
	const optional: FuzzField = { type: "optional", content: node.boxedOptionalChild } as const;

	const value: FuzzField = { type: "required", content: node.boxedRequiredChild } as const;

	const sequence: FuzzField = {
		type: "sequence",
		content: node.boxedSequenceChildren,
	} as const;

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
					const result = selectField(editable.content, random, weights, filter, nodeSchema);
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

function mapBailout<T, U>(
	input: T | "no-valid-selections",
	delegate: (t: T) => U,
): U | "no-valid-selections" {
	return input === "no-valid-selections" ? "no-valid-selections" : delegate(input);
}

function assertNotDone<T>(input: T | typeof done): T {
	assert(input !== done, "Unexpected done");
	return input;
}
