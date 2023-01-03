import {
    AcceptanceCondition,
    AsyncGenerator,
    AsyncWeights,
    BaseFuzzTestState,
    createWeightedAsyncGenerator,
    done,
} from "@fluid-internal/stochastic-test-utils";
import { FieldKey, UpPath } from "../../tree";
import { ITestTreeProvider } from "../utils";
import { getRandomNodePosition } from "./treeGenerator";

export type Operation = TreeEdit;

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
    numberOfEdits: number;
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
        const {
            path,
            nodeField,
            nodeIndex,
        } = getRandomNodePosition(tree, state.random);
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
        const {
            path,
            nodeField,
            nodeIndex,
            isNewPath: newPath,
        } = getRandomNodePosition(tree, state.random, true);
        const fuzzDelete: FuzzDelete = {
            fuzzType: "delete",
            path,
            field: nodeField,
            index: nodeIndex,
            treeIndex: state.treeIndex,
        };
        return fuzzDelete;
    }

    const baseEditGenerator = createWeightedAsyncGenerator<FuzzChange, EditState>([
        [insertGenerator, 2, (state: EditState) => state.numberOfEdits < 10],
        [deleteGenerator, 1, (state: EditState) => state.numberOfEdits < 10]
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
    const atLeastOneActiveClient: AcceptanceCondition<FuzzTestState> = ({ numberOfEdits }) =>
		numberOfEdits > -1;
	const opWeights: AsyncWeights<Operation, FuzzTestState> = [
		[makeEditGenerator(), 1, atLeastOneActiveClient],
	];
	return createWeightedAsyncGenerator(opWeights);
}
