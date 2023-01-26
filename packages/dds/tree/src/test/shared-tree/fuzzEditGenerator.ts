/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    AcceptanceCondition,
    AsyncGenerator,
    AsyncWeights,
    BaseFuzzTestState,
    createWeightedAsyncGenerator,
    done,
    IRandom,
} from "@fluid-internal/stochastic-test-utils";
import { jsonableTreeFromCursor } from "../../feature-libraries";
import { ISharedTree } from "../../shared-tree";
import { brand, fail } from "../../util";
import { ITestTreeProvider } from "../utils";
import { CursorLocationType, FieldKey, mapCursorField, moveToDetachedField, UpPath } from "../../core";

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

export interface NodeLocation {
    path: UpPath | undefined;
    nodeField: FieldKey | undefined;
    nodeIndex: number | undefined;
    onlyRootNode: boolean;
}

export function getRandomNodePosition(
    tree: ISharedTree,
    random: IRandom,
    existingPath = false,
): NodeLocation {
    const moves = {
        field: ["enterNode", "nextField"],
        nodes: ["stop", "firstField"],
    };
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    const firstNode = cursor.firstNode();
    assert(firstNode, "tree must contain at least one node");
    const firstPath = cursor.getPath();
    let path: UpPath | undefined = cursor.getPath();
    let fieldNodes: number = 0;
    let nodeField: FieldKey | undefined;
    let nodeIndex: number | undefined;

    let currentMove = "firstField";
    const testerKey: FieldKey = brand("Test");
    assert(cursor.mode === CursorLocationType.Nodes);

    while (currentMove !== "stop") {
        switch (currentMove) {
            case "enterNode":
                if (fieldNodes > 0) {
                    nodeIndex = random.integer(0, fieldNodes - 1);
                    cursor.enterNode(nodeIndex);
                    path = cursor.getPath();
                    if (typeof nodeField === "object") {
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                    }
                    currentMove = random.pick(moves.nodes);
                    if (currentMove === "stop") {
                        if (cursor.firstField()) {
                            fieldNodes = cursor.getFieldLength();
                            nodeField = cursor.getFieldKey();
                            nodeIndex = fieldNodes !== 0 ? random.integer(0, fieldNodes - 1) : 0;
                            cursor.free();
                            return { path, nodeField, nodeIndex, onlyRootNode: firstPath === path };
                        } else {
                            if (!existingPath) {
                                nodeField = testerKey;
                                nodeIndex = 0;
                            }
                        }
                        break;
                    }
                } else {
                    cursor.free();
                    return {
                        path: undefined,
                        nodeField: undefined,
                        nodeIndex: undefined,
                        onlyRootNode: firstPath === path,
                    };
                }
                break;
            case "firstField":
                try {
                    if (cursor.firstField()) {
                        currentMove = random.pick(moves.field);
                        fieldNodes = cursor.getFieldLength();
                        nodeField = cursor.getFieldKey();
                    } else {
                        currentMove = "stop";
                        if (!existingPath) {
                            nodeField = testerKey;
                            nodeIndex = 0;
                        }
                    }
                    break;
                } catch (error) {
                    cursor.free();
                    return { path, nodeField, nodeIndex, onlyRootNode: firstPath === path };
                }

            case "nextField":
                if (cursor.nextField()) {
                    currentMove = random.pick(moves.field);
                    fieldNodes = cursor.getFieldLength();
                    nodeField = cursor.getFieldKey();
                } else {
                    currentMove = "stop";
                    if (!existingPath) {
                        nodeField = testerKey;
                        nodeIndex = 0;
                    }
                }
                break;
            default:
                fail(`Unexpected move ${currentMove}`);
        }
    }
    cursor.free();
    return { path, nodeField, nodeIndex, onlyRootNode: firstPath === path };
}
