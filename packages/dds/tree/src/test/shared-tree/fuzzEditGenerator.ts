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
import { ISharedTree } from "../../shared-tree";
import { brand, fail } from "../../util";
import { ITestTreeProvider } from "../utils";
import {
	CursorLocationType,
	FieldKey,
	moveToDetachedField,
	rootFieldKeySymbol,
	UpPath,
} from "../../core";

export type Operation = TreeEdit | Synchronize;

export interface TreeEdit {
	type: "edit";
	contents: FuzzChange;
	/** index of the tree to apply the edit to. */
	index: number;
}

export interface FuzzInsert {
	fuzzType: "insert";
	parent: UpPath | undefined;
	field: FieldKey;
	index: number;
	value: number;
}

export interface FuzzDelete {
	fuzzType: "delete";
	path: UpPath;
}

export interface FuzzSetPayload {
	fuzzType: "setPayload";
	path: UpPath;
	value: number;
}

export type FuzzChange = FuzzInsert | FuzzDelete | FuzzSetPayload;

export interface Synchronize {
	type: "synchronize";
}

export interface FuzzTestState extends BaseFuzzTestState {
	testTreeProvider: ITestTreeProvider;
	numberOfEdits: number;
}

export interface TreeContext {
	treeIndex: number;
}

export const makeEditGenerator = (): AsyncGenerator<Operation, FuzzTestState> => {
	type EditState = FuzzTestState & TreeContext;
	async function insertGenerator(state: EditState): Promise<FuzzInsert> {
		const trees = state.testTreeProvider.trees;
		const tree = trees[state.treeIndex];

		// generate edit for that specific tree
		const {
			parent: path,
			parentField: nodeField,
			parentIndex: nodeIndex,
		} = getRandomPlace(tree, state.random);
		const insert: FuzzInsert = {
			fuzzType: "insert",
			parent: path,
			field: nodeField,
			index: nodeIndex,
			value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
		};
		return insert;
	}

	async function deleteGenerator(state: EditState): Promise<FuzzDelete> {
		const trees = state.testTreeProvider.trees;
		const tree = trees[state.treeIndex];
		// generate edit for that specific tree
		const path = getExistingRandomNodePosition(tree, state.random);
		return {
			fuzzType: "delete",
			path,
		};
	}

	async function setPayloadGenerator(state: EditState): Promise<FuzzSetPayload> {
		const trees = state.testTreeProvider.trees;
		const tree = trees[state.treeIndex];
		// generate edit for that specific tree
		const path = getExistingRandomNodePosition(tree, state.random);
		return {
			fuzzType: "setPayload",
			path,
			value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
		};
	}

	const baseEditGenerator = createWeightedAsyncGenerator<FuzzChange, EditState>([
		[insertGenerator, 5],
		[
			deleteGenerator,
			1,
			({ testTreeProvider, treeIndex }) =>
				containsAtLeastOneNode(testTreeProvider.trees[treeIndex]),
		],
		[
			setPayloadGenerator,
			1,
			({ testTreeProvider, treeIndex }) =>
				containsAtLeastOneNode(testTreeProvider.trees[treeIndex]),
		],
	]);

	return async (state: FuzzTestState): Promise<Operation | typeof done> => {
		const trees = state.testTreeProvider.trees;
		// does not include last tree, as we want a passive client
		const treeIndex = trees.length === 1 ? 0 : state.random.integer(0, trees.length - 2);

		const contents = await baseEditGenerator({
			...state,
			treeIndex,
		});
		state.numberOfEdits += 1;
		if (contents === done) {
			return done;
		}
		return { type: "edit", contents, index: treeIndex };
	};
};

export function makeOpGenerator(): AsyncGenerator<Operation, FuzzTestState> {
	const opWeights: AsyncWeights<Operation, FuzzTestState> = [
		[makeEditGenerator(), 3],
		[{ type: "synchronize" }, 1],
	];
	return createWeightedAsyncGenerator(opWeights);
}

const moves = {
	field: ["enterNode", "nextField"],
	nodes: ["stop", "firstField"],
};

const nodePlaceType = ["beforeNode", "afterNode", "belowNode"];

function getRandomPlace(tree: ISharedTree, random: IRandom): UpPath {
	const testerKey: FieldKey = brand("Test");
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
		return { parent: parentPath, parentField: testerKey, parentIndex: 0 };
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
			return { parent: parentPath, parentField: testerKey, parentIndex: 0 };
		default:
			fail(`Unexpected option ${choosePath}`);
	}
}

function getExistingRandomNodePosition(tree: ISharedTree, random: IRandom): UpPath {
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
		return path;
	}
	let fieldNodes: number = cursor.getFieldLength();
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
					return path;
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
	return path;
}

function containsAtLeastOneNode(tree: ISharedTree): boolean {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	const firstNode = cursor.firstNode();
	cursor.free();
	return firstNode;
}
