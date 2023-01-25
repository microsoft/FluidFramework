import {
    AcceptanceCondition,
    AsyncGenerator,
    AsyncWeights,
    BaseFuzzTestState,
    createWeightedAsyncGenerator,
    done,
} from "@fluid-internal/stochastic-test-utils";
import { assert } from "console";
import { FieldKey, UpPath } from "../../tree";
import { ITestTreeProvider } from "../utils";
import { getRandomNodePosition } from "./treeGenerator";

export type Operation = TreeEdit | Synchronize;

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

export interface FuzzSetPayload {
    fuzzType: "setPayload";
    path: UpPath | undefined;
    field: FieldKey | undefined;
    index: number | undefined;
    value: number;
    treeIndex: number;
}

export type FuzzChange = FuzzInsert | FuzzDelete | FuzzSetPayload;

export interface Synchronize {
    type: "synchronize";
}

export interface FuzzTestState extends BaseFuzzTestState {
    testTreeProvider: ITestTreeProvider;
    numberOfEdits: number;
    edits: Operation[];
}

export interface TreeContext {
    treeIndex: number;
}

export const makeEditGenerator = (): AsyncGenerator<Operation, FuzzTestState> => {
    type EditState = FuzzTestState & TreeContext;
    async function insertGenerator(state: EditState): Promise<FuzzInsert> {
        // randomly select a tree in the testTreeProvider
        const trees = state.testTreeProvider.trees;
        const tree = trees[state.treeIndex];

        // generate edit for that specific tree
        const { path, nodeField, nodeIndex } = getRandomNodePosition(tree, state.random);
        assert(typeof nodeField !== "object");
        const insert: FuzzInsert = {
            fuzzType: "insert",
            path,
            field: nodeField,
            index: nodeIndex,
            value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
            treeIndex: state.treeIndex,
        };
        return insert;
    }

    async function deleteGenerator(state: EditState): Promise<FuzzDelete> {
        // randomly select a tree in the testTreeProvider
        const trees = state.testTreeProvider.trees;
        const tree = trees[state.treeIndex];

        // generate edit for that specific tree
        const { path, nodeField, nodeIndex, onlyRootNode } = getRandomNodePosition(
            tree,
            state.random,
            true,
        );
        return onlyRootNode
            ? {
                  fuzzType: "delete",
                  path: undefined,
                  field: undefined,
                  index: undefined,
                  treeIndex: state.treeIndex,
              }
            : {
                  fuzzType: "delete",
                  path,
                  field: nodeField,
                  index: nodeIndex,
                  treeIndex: state.treeIndex,
              };
    }

    async function setPayloadGenerator(state: EditState): Promise<FuzzSetPayload> {
        // randomly select a tree in the testTreeProvider
        const trees = state.testTreeProvider.trees;
        const tree = trees[state.treeIndex];

        // generate edit for that specific tree
        const { path, nodeField, nodeIndex } = getRandomNodePosition(tree, state.random, true);
        const fuzzSetPayload: FuzzSetPayload = {
            fuzzType: "setPayload",
            path,
            field: nodeField,
            index: nodeIndex,
            value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
            treeIndex: state.treeIndex,
        };
        return fuzzSetPayload;
    }

    /**
     * currently the acceptance conditions are based on some arbitrary number of edits.
     * This should be changed to the max number of nodes allowed in tree.
     * TODO: create helper function to get number of nodes in tree and use that to set acceptance condition
     * */
    const baseEditGenerator = createWeightedAsyncGenerator<FuzzChange, EditState>([
        [insertGenerator, 5, (state: EditState) => state.numberOfEdits < 3000],
        [deleteGenerator, 1, (state: EditState) => state.numberOfEdits < 3000],
        [setPayloadGenerator, 1, (state: EditState) => state.numberOfEdits < 3000],
    ]);

    return async (state: FuzzTestState): Promise<Operation | typeof done> => {
        const trees = state.testTreeProvider.trees;
        const treeIndex = state.random.integer(0, trees.length - 1);
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
    const maximumEdits: AcceptanceCondition<FuzzTestState> = ({ numberOfEdits }) =>
        numberOfEdits < 4000;
    const opWeights: AsyncWeights<Operation, FuzzTestState> = [
        [makeEditGenerator(), 3, maximumEdits],
        [{ type: "synchronize" }, 1, maximumEdits],
    ];
    return createWeightedAsyncGenerator(opWeights);
}
