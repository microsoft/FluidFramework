/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AsyncReducer } from "@fluid-internal/stochastic-test-utils";
import { singleTextCursor } from "../../../feature-libraries";
import { brand, fail, TransactionResult } from "../../../util";
import { ITestTreeProvider, toJsonableTree } from "../../utils";
import { ISharedTree, runSynchronous } from "../../../shared-tree";
import { FuzzChange, FuzzTestState, Operation } from "./fuzzEditGenerators";

export const fuzzReducer: {
	[K in Operation["type"]]: AsyncReducer<Extract<Operation, { type: K }>, FuzzTestState>;
} = {
	edit: async (state, operation) => {
		const { index, contents } = operation;
		assert(state.testTreeProvider !== undefined);
		const tree = state.testTreeProvider.trees[index];
		applyFuzzChange(tree, contents, TransactionResult.Commit);
		return state;
	},
	synchronize: async (state) => {
		const { testTreeProvider } = state;
		assert(testTreeProvider !== undefined);
		await testTreeProvider.ensureSynchronized();
		checkTreesAreSynchronized(testTreeProvider);
		return state;
	},
};

export const fuzzReducerComposeVsIndividual: {
	[K in Operation["type"]]: AsyncReducer<Extract<Operation, { type: K }>, FuzzTestState>;
} = {
	edit: async (state, operation) => {
		const { index, contents } = operation;
		const tree = state.trees[index];
		applyFuzzChangeNoTransactionResult(tree, contents);
		return state;
	},
	synchronize: async (state) => {
		return state;
	},
};

export function checkTreesAreSynchronized(provider: ITestTreeProvider) {
	const lastTree = toJsonableTree(provider.trees[provider.trees.length - 1]);
	for (let i = 0; i < provider.trees.length - 1; i++) {
		const actual = toJsonableTree(provider.trees[i]);
		// Uncomment to get a merged view of the trees
		// const mergedView = merge(actual, lastTree);
		assert.deepEqual(actual, lastTree);
	}
}

function applyFuzzChange(
	tree: ISharedTree,
	contents: FuzzChange,
	transactionResult: TransactionResult,
): void {
	switch (contents.fuzzType) {
		case "insert":
			runSynchronous(tree, () => {
				const field = tree.editor.sequenceField(contents.parent, contents.field);
				field.insert(
					contents.index,
					singleTextCursor({ type: brand("Test"), value: contents.value }),
				);
				return transactionResult;
			});
			break;
		case "delete":
			runSynchronous(tree, () => {
				const field = tree.editor.sequenceField(
					contents.firstNode?.parent,
					contents.firstNode?.parentField,
				);
				field.delete(contents.firstNode?.parentIndex, contents.count);
				return transactionResult;
			});
			break;
		case "setPayload":
			runSynchronous(tree, () => {
				tree.editor.setValue(contents.path, contents.value);
				return transactionResult;
			});
			break;
		default:
			fail("Invalid edit.");
	}
}

function applyFuzzChangeNoTransactionResult(tree: ISharedTree, contents: FuzzChange): void {
	switch (contents.fuzzType) {
		case "insert": {
			const field = tree.editor.sequenceField(contents.parent, contents.field);
			field.insert(
				contents.index,
				singleTextCursor({ type: brand("Test"), value: contents.value }),
			);
			break;
		}
		case "delete": {
			const field = tree.editor.sequenceField(
				contents.firstNode?.parent,
				contents.firstNode?.parentField,
			);
			field.delete(contents.firstNode?.parentIndex, contents.count);
			break;
		}
		case "setPayload": {
			tree.editor.setValue(contents.path, contents.value);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}
