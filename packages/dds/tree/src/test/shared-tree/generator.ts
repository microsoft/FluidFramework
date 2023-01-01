import {
    AsyncGenerator,
    BaseFuzzTestState,
    createWeightedAsyncGenerator,
} from "@fluid-internal/stochastic-test-utils";
import { FieldKey, UpPath } from "../../tree";
import { ITestTreeProvider } from "../utils";
import { getRandomNodePosition } from "./treeGenerator";

type Operation = TreeEdit;

export interface TreeEdit {
    type: "edit";
    contents: FuzzChange;
    /** index of the tree to apply the edit to. */
    index: number;
}

export interface FuzzInsert {
    fuzzType: "insert";
    path: UpPath | undefined;
    field: FieldKey | undefined;
    index: number | undefined;
    value: number | undefined;
    treeIndex: number;
}

export interface FuzzDelete {
    fuzzType: "delete";
    path: UpPath | undefined;
    field: FieldKey | undefined;
    index: number | undefined;
    treeIndex: number;
}

export type FuzzChange = FuzzInsert | FuzzDelete;

export interface FuzzTestState extends BaseFuzzTestState {
    testTreeProvider: ITestTreeProvider;
}

export const makeEditGenerator = (): AsyncGenerator<Operation, FuzzTestState> => {
    async function insertGenerator(state: FuzzTestState): Promise<FuzzInsert> {
        // randomly select a tree in the testTreeProvider
        const trees = state.testTreeProvider.trees;
        const treeIndex = state.random.integer(0, trees.length - 1);
        const tree = trees[treeIndex];

        // generate edit for that specific tree
        const {
            path,
            nodeField,
            nodeIndex,
            isNewPath: newPath,
        } = getRandomNodePosition(tree, state.random);
        const insert: FuzzInsert = {
            fuzzType: "insert",
            path,
            field: nodeField,
            index: nodeIndex,
            value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
            treeIndex,
        };
        return insert;
    }

    async function deleteGenerator(state: FuzzTestState): Promise<FuzzDelete> {
        // randomly select a tree in the testTreeProvider
        const trees = state.testTreeProvider.trees;
        const treeIndex = state.random.integer(0, trees.length - 1);
        const tree = trees[treeIndex];

        // generate edit for that specific tree
        const {
            path,
            nodeField,
            nodeIndex,
            isNewPath: newPath,
        } = getRandomNodePosition(tree, state.random);
        const fuzzDelete: FuzzDelete = {
            fuzzType: "delete",
            path,
            field: nodeField,
            index: nodeIndex,
            treeIndex,
        };
        return fuzzDelete;
    }

    const baseEditGenerator = createWeightedAsyncGenerator<FuzzChange, FuzzTestState>([
        [insertGenerator, 1, (state: FuzzTestState) => state !== undefined],
        [deleteGenerator, 1, (state: FuzzTestState) => state !== undefined],
    ]);

    return async (state: FuzzTestState): Promise<Operation> => {
        const trees = state.testTreeProvider.trees;
        const treeIndex = state.random.integer(0, trees.length - 1);
        const tree = trees[treeIndex];
        const contents = (await baseEditGenerator(state)) as FuzzChange;
        return { type: "edit", contents, index: treeIndex };
    };
};
