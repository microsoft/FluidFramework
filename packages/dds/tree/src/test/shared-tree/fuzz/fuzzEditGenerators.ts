/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type AsyncGenerator,
	type BaseFuzzTestState,
	type Generator,
	type IRandom,
	type Weights,
	createWeightedGenerator,
	done,
} from "@fluid-private/stochastic-test-utils";
import type { Client, DDSFuzzTestState, DDSRandom } from "@fluid-private/test-dds-utils";

import type {
	TreeStoredSchemaRepository,
	FieldKey,
	FieldUpPath,
	UpPath,
	TreeNodeSchemaIdentifier,
} from "../../../core/index.js";
import { type DownPath, toDownPath } from "../../../feature-libraries/index.js";
import { Tree, type ITreePrivate, type SharedTree } from "../../../shared-tree/index.js";
import { fail, getOrCreate, makeArray } from "../../../util/index.js";

import {
	type FuzzNode,
	createTreeViewSchema,
	type FuzzNodeSchema,
	type fuzzFieldSchema,
	nodeSchemaFromTreeSchema,
} from "./fuzzUtils.js";
import {
	type Insert,
	type Remove,
	type SetField,
	type IntraFieldMove,
	type Operation,
	type OptionalFieldEdit,
	type RequiredFieldEdit,
	type SchemaChange,
	type SequenceFieldEdit,
	type Synchronize,
	type TransactionBoundary,
	type TreeEdit,
	type UndoRedo,
	type FieldEdit,
	type CrossFieldMove,
	type Constraint,
	type GeneratedFuzzNode,
	GeneratedFuzzValueType,
	type NodeRange,
	type ForkMergeOperation,
} from "./operationTypes.js";
// eslint-disable-next-line import/no-internal-modules
import type { SchematizingSimpleTreeView } from "../../../shared-tree/schematizingTreeView.js";
import { asTreeViewAlpha, getOrCreateInnerNode } from "../../../simple-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeNode,
	type TreeNodeSchema,
} from "../../../simple-tree/index.js";
import type { TreeFactory } from "../../../treeFactory.js";

export type FuzzView = SchematizingSimpleTreeView<typeof fuzzFieldSchema> & {
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

export type FuzzTransactionView = SchematizingSimpleTreeView<typeof fuzzFieldSchema> & {
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

export interface FuzzTestState extends DDSFuzzTestState<TreeFactory> {
	/**
	 * Schematized view of clients and their nodeSchemas. Created lazily by viewFromState.
	 *
	 * SharedTrees undergoing a transaction will have a forked view in {@link transactionViews} instead,
	 * which should be used in place of this view until the transaction is complete.
	 */
	clientViews?: Map<SharedTree, FuzzView>;
	/**
	 * Schematized view of clients undergoing transactions with their nodeSchemas.
	 * Edits to this view are not visible to other clients until the transaction is closed.
	 *
	 * Maintaining a separate view here is necessary since async transactions are not supported on the root checkout,
	 * and the fuzz testing model only simulates async transactions.
	 */
	transactionViews?: Map<ITreePrivate, FuzzTransactionView>;

	/**
	 * Schematized view of clients' forked views and their nodeSchemas.
	 *
	 * SharedTrees undergoing a transaction will have a forked view in {@link transactionViews} instead,
	 * which should be used in place of this view until the transaction is complete.
	 */
	forkedViews?: Map<SharedTree, FuzzView[]>;
}

export function viewFromState(
	state: FuzzTestState,
	client: Client<TreeFactory> = state.client,
	forkedBranchIndex?: number | undefined,
): FuzzView {
	state.clientViews ??= new Map();

	// If the forked view info contains the branch number, return that branch. Otherwise return the main client view
	if (forkedBranchIndex !== undefined) {
		const forkedViews = state.forkedViews?.get(client.channel);
		assert(
			forkedViews !== undefined && forkedViews.length >= forkedBranchIndex,
			"branch does not exist",
		);
		return forkedViews[forkedBranchIndex];
	}

	const view =
		state.transactionViews?.get(client.channel) ??
		(getOrCreate(state.clientViews, client.channel, (tree) => {
			const treeSchema = simpleSchemaFromStoredSchema(tree.storedSchema);
			const config = new TreeViewConfiguration({
				schema: treeSchema,
			});

			const treeView = asTreeViewAlpha(tree.viewWith(config));
			treeView.events.on("schemaChanged", () => {
				if (!treeView.compatibility.canView) {
					treeView.dispose();
					state.clientViews?.delete(client.channel);
				}
			});

			assert(treeView.compatibility.isEquivalent);
			const fuzzView = treeView as FuzzView;
			assert.equal(fuzzView.currentSchema, undefined);
			const nodeSchema = nodeSchemaFromTreeSchema(treeSchema);

			fuzzView.currentSchema = nodeSchema ?? assert.fail("nodeSchema should not be undefined");
			return fuzzView;
		}) as unknown as FuzzView);
	return view;
}
function filterFuzzNodeSchemas(
	nodeSchemas: Iterable<TreeNodeSchemaIdentifier>,
	prefix: string,
	omitInitialNodeSchemas: string[],
): TreeNodeSchemaIdentifier[] {
	const values: TreeNodeSchemaIdentifier[] = [];

	for (const key of nodeSchemas) {
		if (
			typeof key === "string" &&
			key.startsWith(prefix) &&
			!omitInitialNodeSchemas.some((InitialNodeSchema) => key.includes(InitialNodeSchema))
		) {
			values.push(key);
		}
	}

	return values;
}
export function simpleSchemaFromStoredSchema(
	storedSchema: TreeStoredSchemaRepository,
): typeof fuzzFieldSchema {
	const schemaFactory = new SchemaFactory("treeFuzz");
	const nodeSchemas = filterFuzzNodeSchemas(storedSchema.nodeSchema.keys(), "treeFuzz", [
		"treeFuzz.FuzzNumberNode",
		"treeFuzz.FuzzStringNode",
		"treeFuzz.node",
		"treeFuzz.FuzzHandleNode",
		"treeFuzz.arrayChildren",
	]);
	const fuzzNodeSchemas: TreeNodeSchema[] = [];
	for (const nodeSchema of nodeSchemas) {
		class GUIDNodeSchema extends schemaFactory.object(
			nodeSchema.substring("treeFuzz.".length),
			{
				value: schemaFactory.number,
			},
		) {}
		fuzzNodeSchemas.push(GUIDNodeSchema);
	}
	return createTreeViewSchema(fuzzNodeSchemas);
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
	 * Select the current Fuzz node's "sequenceChildren" field
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
	fork: number;
	merge: number;
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
	fork: 0,
	merge: 0,
};

export interface EditGeneratorOptions {
	weights: Partial<EditGeneratorOpWeights>;
	maxRemoveCount: number;
}

export function getAllowableNodeTypes(state: FuzzTestState) {
	const fuzzView = viewFromState(state, state.client);
	const nodeSchema = fuzzView.currentSchema;
	const nodeTypes = [];
	for (const leafNodeSchema of nodeSchema.info.optionalChild.allowedTypeSet) {
		if (typeof leafNodeSchema !== "string") {
			nodeTypes.push(leafNodeSchema.identifier);
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

	const generatedValue = (state: FuzzTestState): GeneratedFuzzNode => {
		const allowableNodeTypes = getAllowableNodeTypes(state);
		const nodeTypeToGenerate = state.random.pick(allowableNodeTypes);

		switch (nodeTypeToGenerate) {
			case "com.fluidframework.leaf.string":
				return {
					type: GeneratedFuzzValueType.String,
					value: state.random
						.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
						.toString(),
				};
			case "com.fluidframework.leaf.number":
				return {
					type: GeneratedFuzzValueType.Number,
					value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
				};
			case "com.fluidframework.leaf.handle":
				return {
					type: GeneratedFuzzValueType.Handle,
					value: state.random.handle(),
				};
			case "treeFuzz.node":
				return {
					type: GeneratedFuzzValueType.NodeObject,
					value: {
						requiredChild: state.random.integer(
							Number.MIN_SAFE_INTEGER,
							Number.MAX_SAFE_INTEGER,
						),
						arrayChildren: [],
					},
				};
			default:
				// This would be the for the case when the node type was one of our custom node with GUID as the identifier
				return { type: GeneratedFuzzValueType.GUIDNode, value: { guid: nodeTypeToGenerate } };
		}
	};

	interface FuzzTestStateForFieldEdit<TFuzzField extends FuzzField = FuzzField>
		extends FuzzTestState {
		fieldInfo: TFuzzField;
		branchIndex: number | undefined;
	}

	const sequenceFieldEditGenerator = createWeightedGeneratorWithBailout<
		SequenceFieldEdit["edit"],
		FuzzTestStateForFieldEdit<SequenceFuzzField>
	>([
		[
			(state): Insert => ({
				type: "insert",
				index: state.random.integer(0, state.fieldInfo.parentFuzzNode.arrayChildren.length),
				content: makeArray(state.random.integer(1, 3), () => generatedValue(state)),
			}),
			weights.insert,
		],
		[
			({ fieldInfo, random }): Remove => {
				const field = fieldInfo.parentFuzzNode;
				return {
					type: "remove",

					// By avoiding large deletions we're more likely to generate more interesting outcomes.
					// It'd be reasonable to move this to config.
					range: chooseRangeWithMaxLength(random, field.arrayChildren.length, 3),
				};
			},
			weights.remove,
			({ fieldInfo }) => fieldInfo.parentFuzzNode.arrayChildren.length > 0,
		],
		[
			({ fieldInfo, random }): IntraFieldMove => {
				const field = fieldInfo.parentFuzzNode;
				return {
					type: "intraFieldMove",
					range: chooseRange(random, field.arrayChildren.length),
					dstIndex: random.integer(0, field.arrayChildren.length),
				};
			},
			weights.intraFieldMove,
			({ fieldInfo }) => fieldInfo.parentFuzzNode.arrayChildren.length > 0,
		],
		[
			(state): CrossFieldMove => {
				const srcField = state.fieldInfo.parentFuzzNode.arrayChildren;
				const dstFieldInfo = selectTreeField(
					viewFromState(state, state.client, state.branchIndex),
					state.random,
					weights.fieldSelection,
					(field: FuzzField) =>
						field.type === "sequence" && !Tree.contains(srcField, field.parentFuzzNode),
				);
				assert(dstFieldInfo.type === "sequence");
				const dstParent = dstFieldInfo.parentFuzzNode;
				return {
					type: "crossFieldMove",
					range: chooseRange(state.random, srcField.length),
					dstParent: maybeDownPathFromNode(
						dstParent,
						viewFromState(state, state.client, state.branchIndex).currentSchema,
					),
					dstIndex: state.random.integer(0, dstParent.arrayChildren.length),
				};
			},
			weights.crossFieldMove,
			({ fieldInfo }) => fieldInfo.parentFuzzNode.arrayChildren.length > 0,
		],
	]);

	const optionalFieldEditGenerator = createWeightedGenerator<
		OptionalFieldEdit["edit"],
		FuzzTestStateForFieldEdit<OptionalFuzzField>
	>([
		[
			(state): SetField => ({
				type: "set",
				value: generatedValue(state),
			}),
			weights.set,
		],
		[
			{ type: "clear" },
			weights.clear,
			(state) => state.fieldInfo.parentFuzzNode !== undefined,
		],
	]);

	const requiredFieldEditGenerator = (
		state: FuzzTestStateForFieldEdit<RequiredFuzzField>,
	): RequiredFieldEdit["edit"] => ({
		type: "set",
		value: generatedValue(state),
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

	function chooseRange(random: DDSRandom, fieldLength: number): NodeRange {
		return chooseRangeWithMaxLength(random, fieldLength, fieldLength);
	}

	function chooseRangeWithMaxLength(
		random: DDSRandom,
		fieldLength: number,
		maxLength: number,
	): NodeRange {
		const length = random.integer(1, Math.min(fieldLength, maxLength));
		const first = random.integer(0, fieldLength - length);
		const last = first + length - 1;
		return { first, last };
	}

	return (state) => {
		let fieldInfo: FuzzField;
		let change: ReturnType<typeof fieldEditChangeGenerator>;
		// This could be surfaced as a config option if desired. In practice, the corresponding assert is most
		// likely to be hit during when a test is badly configured, in which case the remedy is to fix the config,
		// as opposed to increasing the number of attempts.
		let attemptsRemaining = 20;
		const clientForkedViews = state.forkedViews?.get(state.client.channel);
		const forkedViewIndex =
			clientForkedViews !== undefined && clientForkedViews.length > 0
				? state.random.integer(0, clientForkedViews.length - 1)
				: undefined;
		const forkOrMain = state.random.pick(["fork", "main"]);
		const selectedForkIndex = forkOrMain === "fork" ? forkedViewIndex : undefined;
		do {
			fieldInfo = selectTreeField(
				viewFromState(state, state.client, selectedForkIndex),
				state.random,
				weights.fieldSelection,
			);
			change = fieldEditChangeGenerator({
				...state,
				fieldInfo,
				branchIndex: selectedForkIndex,
			});
			attemptsRemaining -= 1;
		} while (change === "no-valid-selections" && attemptsRemaining > 0);
		assert(change !== "no-valid-selections", "No valid field edit found");
		return {
			type: "treeEdit",
			edit: {
				type: "fieldEdit",
				parentNodePath: maybeDownPathFromNode(
					fieldInfo.parentFuzzNode,
					viewFromState(state, state.client, selectedForkIndex).currentSchema,
				),
				change,
			},
			forkedViewIndex: selectedForkIndex,
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
			(state) => viewFromState(state).checkout.transaction.isInProgress(),
		],
		[
			{
				type: "transactionBoundary",
				boundary: "abort",
			},
			opWeights.abort,
			(state) => viewFromState(state).checkout.transaction.isInProgress(),
		],
	]);
};

export const makeBranchEditGenerator = (
	opWeightsArg: Partial<EditGeneratorOpWeights>,
): Generator<ForkMergeOperation, FuzzTestState> => {
	const opWeights = {
		...defaultEditGeneratorOpWeights,
		...opWeightsArg,
	};

	return createWeightedGenerator<ForkMergeOperation, FuzzTestState>([
		[
			(state): ForkMergeOperation => {
				const forkedViews = state.forkedViews?.get(state.client.channel);
				const forkedViewsLength = forkedViews === undefined ? 0 : forkedViews.length;
				return {
					type: "forkMergeOperation",
					contents: {
						type: "fork",
						branchNumber:
							forkedViewsLength === 0
								? undefined
								: state.random.integer(0, forkedViewsLength - 1),
					},
				};
			},
			opWeights.fork,
		],
		[
			(state): ForkMergeOperation => {
				const forkedViews = state.forkedViews?.get(state.client.channel) ?? [];
				const forkedViewsLength = forkedViews.length;

				if (forkedViewsLength === 0) {
					return {
						type: "forkMergeOperation",
						contents: { type: "merge", baseBranch: undefined, forkBranch: undefined },
					};
				}

				const forkedBranchIndex = state.random.integer(0, forkedViewsLength - 1);

				return {
					type: "forkMergeOperation",
					contents: {
						type: "merge",
						baseBranch:
							forkedViews.length > 0
								? state.random.integer(0, forkedViews.length - 1)
								: undefined,
						forkBranch: forkedBranchIndex,
					},
				};
			},
			opWeights.merge,
			(state) =>
				state.forkedViews?.get(state.client.channel) !== undefined &&
				state.forkedViews.get(state.client.channel)?.length !== 0,
		],
	]);
};

export const schemaEditGenerator: Generator<SchemaChange, FuzzTestState> = (state) => ({
	type: "schemaChange",
	contents: { type: state.random.uuid4() },
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
			(state): Constraint => {
				const selectedField = selectTreeField(
					viewFromState(state),
					state.random,
					opWeights.fieldSelection,
				);

				return {
					type: "constraint",
					content: {
						type: "nodeConstraint",
						nodePath: maybeDownPathFromNode(
							selectedField.parentFuzzNode,
							viewFromState(state).currentSchema,
						),
					},
				};
			},
			opWeights.nodeConstraint,
		],
	]);
};

export function makeOpGenerator(
	weightsArg: Partial<EditGeneratorOpWeights> = defaultEditGeneratorOpWeights,
): AsyncGenerator<Operation, DDSFuzzTestState<TreeFactory>> {
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
		fork,
		merge,
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
					(state: FuzzTestState) => viewFromState(state).checkout.transaction.isInProgress(),
				],
				[() => makeBranchEditGenerator(weights), weights.fork + weights.merge],
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

function upPathFromNode(node: TreeNode): UpPath {
	const flexNode = getOrCreateInnerNode(node);
	const anchorNode = flexNode.anchorNode;
	return anchorNode;
}

function downPathFromNode(node: TreeNode): DownPath {
	return toDownPath(upPathFromNode(node));
}

export function maybeDownPathFromNode(
	node: TreeNode | undefined,
	nodeSchema: FuzzNodeSchema,
): DownPath | undefined {
	return Tree.is(node, nodeSchema) ? downPathFromNode(node) : undefined;
}

// Using TreeNode instead of FuzzNode to handle the case where the root node is not a FuzzNode (like a leafNode or undefined)
interface OptionalFuzzField {
	type: "optional";
	parentFuzzNode: TreeNode;
}

interface SequenceFuzzField {
	type: "sequence";
	parentFuzzNode: FuzzNode;
}

interface RequiredFuzzField {
	type: "required";
	parentFuzzNode: FuzzNode;
}

type FuzzField = OptionalFuzzField | SequenceFuzzField | RequiredFuzzField;

type FieldFilter = (field: FuzzField) => boolean;

function selectField(
	node: TreeNode,
	random: IRandom,
	weights: Omit<FieldSelectionWeights, "filter">,
	filter: FieldFilter = () => true,
	nodeSchema: FuzzNodeSchema,
): FuzzField | "no-valid-selections" {
	assert(Tree.is(node, nodeSchema));
	const optional: FuzzField = {
		type: "optional",
		parentFuzzNode: node,
	} as const;

	const value: FuzzField = {
		type: "required",
		parentFuzzNode: node,
	} as const;

	const sequence: FuzzField = {
		type: "sequence",
		parentFuzzNode: node,
	} as const;

	const recurse = (state: { random: IRandom }): FuzzField | "no-valid-selections" => {
		const childNodes: FuzzNode[] = [];
		// Checking "=== true" causes tsc to fail to typecheck, as it is no longer able to narrow according
		// to the .is typeguard.
		if (Tree.is(node.optionalChild, nodeSchema)) {
			childNodes.push(node.optionalChild);
		}

		if (Tree.is(node.requiredChild, nodeSchema)) {
			childNodes.push(node.requiredChild);
		}
		node.arrayChildren.map((child) => {
			if (Tree.is(child, nodeSchema)) {
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
	const editable = tree.root;
	const nodeSchema = tree.currentSchema;

	if (!Tree.is(editable, nodeSchema)) {
		return { type: "optional", parentFuzzNode: editable as TreeNode } as const;
	}
	assert(Tree.is(editable, nodeSchema));
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
				const field = { type: "optional", parentFuzzNode: editable } as const;
				if (filter(field)) {
					return field;
				}
				break;
			}
			case "recurse": {
				// Checking "=== true" causes tsc to fail to typecheck, as it is no longer able to narrow according
				// to the .is typeguard.
				if (Tree.is(editable, nodeSchema)) {
					const result = selectField(editable, random, weights, filter, nodeSchema);
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
	if (tree.root !== undefined && result.parentFuzzNode !== undefined) {
		assert(Tree.contains(tree.root as TreeNode, result.parentFuzzNode));
	}
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
