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
    path: UpPath | undefined;
}

export interface FuzzSetPayload {
    fuzzType: "setPayload";
    path: UpPath | undefined;
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
            field: nodeField,
            index: nodeIndex,
        } = getRandomNodePosition(tree, state.random);
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
        const path = containsAtLeastOneNode(tree)
            ? getExistingRandomNodePosition(tree, state.random)
            : undefined;
        return {
            fuzzType: "delete",
            path,
        };
    }

    async function setPayloadGenerator(state: EditState): Promise<FuzzSetPayload> {
        const trees = state.testTreeProvider.trees;
        const tree = trees[state.treeIndex];
        // generate edit for that specific tree
        const path = containsAtLeastOneNode(tree)
            ? getExistingRandomNodePosition(tree, state.random)
            : undefined;
        return {
            fuzzType: "setPayload",
            path,
            value: state.random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
        };
    }

    /**
     * currently the acceptance conditions are based on some arbitrary number of edits.
     * This should be changed to the max number of nodes allowed in tree.
     * TODO: create helper function to get number of nodes in tree and use that to set acceptance condition
     * */
    const baseEditGenerator = createWeightedAsyncGenerator<FuzzChange, EditState>([
        [insertGenerator, 5],
        [deleteGenerator, 1],
        [setPayloadGenerator, 1],
    ]);

    return async (state: FuzzTestState): Promise<Operation | typeof done> => {
        const trees = state.testTreeProvider.trees;
        // does not include last tree, as we want a passive client
        const treeIndex = state.random.integer(0, trees.length - 2);
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

export interface NodeLocation {
    parent: UpPath | undefined;
    field: FieldKey;
    index: number;
}

const moves = {
    field: ["enterNode", "nextField"],
    nodes: ["stop", "firstField"],
};

export function getRandomNodePosition(tree: ISharedTree, random: IRandom): NodeLocation {
    const testerKey: FieldKey = brand("Test");
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    const firstNode = cursor.firstNode();
    if (!firstNode) {
        // no node exists, insert a rootnode
        cursor.free();
        return { parent: undefined, field: rootFieldKeySymbol, index: 0 };
    }
    let parentPath: UpPath | undefined = cursor.getPath();
    const firstField = cursor.firstField();
    if (!firstField) {
        // no fields, insert at random field at index 0 under rootnode
        cursor.free();
        return { parent: parentPath, field: testerKey, index: 0 };
    }
    let fieldNodes: number = cursor.getFieldLength();
    let nodeField: FieldKey = testerKey; // if no field is selected use default testerKey
    let nodeIndex: number = 0;

    let currentMove = random.pick(moves.field);
    assert(cursor.mode === CursorLocationType.Fields);

    while (currentMove !== "stop") {
        switch (currentMove) {
            case "enterNode":
                if (fieldNodes > 0) {
                    nodeIndex = random.integer(0, fieldNodes - 1);
                    cursor.enterNode(nodeIndex);
                    parentPath = cursor.getPath();
                    currentMove = random.pick(moves.nodes);
                    if (currentMove === "stop") {
                        if (cursor.firstField()) {
                            fieldNodes = cursor.getFieldLength();
                            nodeField = cursor.getFieldKey();
                            nodeIndex = fieldNodes !== 0 ? random.integer(0, fieldNodes - 1) : 0;
                            cursor.free();
                            return { parent: parentPath, field: nodeField, index: nodeIndex };
                        } else {
                            nodeField = testerKey;
                            nodeIndex = 0;
                        }
                        break;
                    }
                } else {
                    cursor.free();
                    return {
                        parent: parentPath,
                        field: nodeField,
                        index: 0,
                    };
                }
                break;
            case "firstField":
                if (cursor.firstField()) {
                    currentMove = random.pick(moves.field);
                    fieldNodes = cursor.getFieldLength();
                    nodeField = cursor.getFieldKey();
                } else {
                    cursor.free();
                    return { parent: parentPath, field: testerKey, index: 0 };
                }
                break;

            case "nextField":
                if (cursor.nextField()) {
                    currentMove = random.pick(moves.field);
                    fieldNodes = cursor.getFieldLength();
                    nodeField = cursor.getFieldKey();
                } else {
                    currentMove = "stop";
                    nodeField = testerKey;
                    nodeIndex = 0;
                }
                break;
            default:
                fail(`Unexpected move ${currentMove}`);
        }
    }
    cursor.free();
    return { parent: parentPath, field: nodeField, index: nodeIndex };
}

export function getExistingRandomNodePosition(
    tree: ISharedTree,
    random: IRandom,
): UpPath | undefined {
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
                    const currentPath = cursor.getPath();
                    if (currentPath !== undefined) {
                        path = currentPath;
                        currentMove = random.pick(moves.nodes);
                    } else {
                        // if node position does not exist, we can just return parent
                        cursor.free();
                        return path;
                    }

                    if (currentMove === "stop") {
                        if (cursor.firstField()) {
                            fieldNodes = cursor.getFieldLength();
                            nodeIndex = fieldNodes !== 0 ? random.integer(0, fieldNodes - 1) : 0;
                            cursor.free();
                            return path;
                        }
                        break;
                    }
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

export function containsAtLeastOneNode(tree: ISharedTree): boolean {
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    const firstNode = cursor.firstNode();
    cursor.free();
    return firstNode;
}
