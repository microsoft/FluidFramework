/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AsyncReducer } from "@fluid-internal/stochastic-test-utils";
import { ITestContainerConfig, waitForContainerConnection } from "@fluidframework/test-utils";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { singleTextCursor } from "../../../feature-libraries";
import { brand, fail } from "../../../util";
import { toJsonableTree } from "../../utils";
import { ISharedTree } from "../../../shared-tree";
import { FuzzTestState } from "./fuzzEditGenerators";
import {
	FieldEdit,
	FuzzFieldChange,
	FuzzNodeEditChange,
	FuzzTransactionType,
	NodeEdit,
	Operation,
} from "./operationTypes";

export const fuzzReducer: {
	[K in Operation["type"]]: AsyncReducer<Extract<Operation, { type: K }>, FuzzTestState>;
} = {
	edit: async (state, operation) => {
		const { contents } = operation;
		switch (contents.editType) {
			case "fieldEdit": {
				const index = operation.index;
				const tree = state.trees[index];
				applyFieldEdit(tree, contents);
				break;
			}
			case "nodeEdit": {
				const change = operation.contents as NodeEdit;
				const index = operation.index;
				const tree = state.trees[index];
				applyNodeEdit(tree, change.edit);
				break;
			}
			default:
				break;
		}
		return state;
	},
	synchronize: async (state) => {
		const { testTreeProvider } = state;
		assert(testTreeProvider !== undefined);
		await testTreeProvider.ensureSynchronized();
		checkTreesAreSynchronized(state.trees);
		return state;
	},
	transaction: async (state, operation) => {
		const { contents, treeIndex } = operation;
		const tree = state.trees[treeIndex];
		applyTransactionEdit(tree, contents);
		return state;
	},
	reconnect: async (state, operation) => {
		const { index } = operation;
		assert(state.containersInfo !== undefined);
		state.testTreeProvider?.opProcessingController.resumeProcessing();
		assert(state.testTreeProvider !== undefined);
		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});
		const testContainerConfig: ITestContainerConfig = {
			loaderProps: {
				configProvider: configProvider({
					"Fluid.Container.enableOfflineLoad": true,
				}),
			},
		};
		const loader = state.testTreeProvider.makeTestLoader(testContainerConfig);
		const url = state.containersInfo[index].url;
		const pendingOps = state.containersInfo[index].pendingOps;
		const loadedContainer = await loader.resolve({ url }, pendingOps);
		await waitForContainerConnection(loadedContainer, true);
		state.containersInfo[index].pendingOps = undefined;
		state.containersInfo[index].url = "";
	},
	disconnect: async (state, operation) => {
		const { index } = operation;
		assert(state.containersInfo !== undefined);
		const pauseContainer = state.testTreeProvider?.containers[index];
		assert(pauseContainer !== undefined);
		const url = (await pauseContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
		await state.testTreeProvider?.opProcessingController.pauseProcessing(pauseContainer);
		const pendingOps = pauseContainer.closeAndGetPendingLocalState();
		state.containersInfo[index].pendingOps = pendingOps;
		state.containersInfo[index].url = url;
		assert(url !== "");
	},
};

export function checkTreesAreSynchronized(trees: readonly ISharedTree[]) {
	const lastTree = toJsonableTree(trees[trees.length - 1]);
	for (let i = 0; i < trees.length - 1; i++) {
		const actual = toJsonableTree(trees[i]);
		// Uncomment to get a merged view of the trees
		// const mergedView = merge(actual, lastTree);
		assert.deepEqual(actual, lastTree);
	}
}

function applyFieldEdit(tree: ISharedTree, fieldEdit: FieldEdit): void {
	switch (fieldEdit.change.type) {
		case "sequence":
			applySequenceFieldEdit(tree, fieldEdit.change.edit);
			break;
		default:
			break;
	}
}

function applySequenceFieldEdit(tree: ISharedTree, change: FuzzFieldChange): void {
	switch (change.type) {
		case "insert": {
			const field = tree.editor.sequenceField(change.parent, change.field);
			field.insert(
				change.index,
				singleTextCursor({ type: brand("Test"), value: change.value }),
			);
			break;
		}
		case "delete": {
			const field = tree.editor.sequenceField(
				change.firstNode?.parent,
				change.firstNode?.parentField,
			);
			field.delete(change.firstNode?.parentIndex, change.count);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}

function applyNodeEdit(tree: ISharedTree, change: FuzzNodeEditChange): void {
	switch (change.nodeEditType) {
		case "setPayload": {
			tree.editor.setValue(change.path, change.value);
			break;
		}
		default:
			fail("Invalid edit.");
	}
}
function applyTransactionEdit(tree: ISharedTree, contents: FuzzTransactionType): void {
	switch (contents.fuzzType) {
		case "transactionStart": {
			tree.transaction.start();
			break;
		}
		case "transactionCommit": {
			tree.transaction.commit();
			break;
		}
		case "transactionAbort": {
			tree.transaction.abort();
			break;
		}
		default:
			fail("Invalid edit.");
	}
}
