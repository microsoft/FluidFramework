import { strict as assert } from "assert";
import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { moveToDetachedField } from "../../forest";
import { ISharedTree } from "../../shared-tree";
import { CursorLocationType, FieldKey, mapCursorField, UpPath } from "../../tree";
import { brand, fail } from "../../util";
import { jsonableTreeFromCursor } from "../../feature-libraries";

export interface NodeLocation {
    path: UpPath | undefined;
    nodeField: FieldKey | undefined;
    nodeIndex: number | undefined;
    onlyRootNode: boolean;
}

export function getRandomNodePosition(tree: ISharedTree, random: IRandom, existingPath = false): NodeLocation {
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
    assert(cursor.mode === CursorLocationType.Nodes)

    while (currentMove !== "stop") {
        switch (currentMove) {
            case "enterNode":
                if (fieldNodes > 0) {
                    nodeIndex = random.integer(0, fieldNodes - 1);
                    // assert(cursor.mode === CursorLocationType.Fields, "must be in fields mode");
                    cursor.enterNode(nodeIndex);
                    path = cursor.getPath();
                    // nodeField = cursor.getFieldKey();
                    if (typeof(nodeField) === 'object') {
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                    }
                    currentMove = random.pick(moves.nodes);
                    if (currentMove === "stop") {
                        if (cursor.firstField()) {
                            // assert(cursor.mode === CursorLocationType.Fields, "must be in fields mode");
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
                    // This means no
                    cursor.free()
                    return { path:undefined, nodeField:undefined, nodeIndex:undefined, onlyRootNode: firstPath === path}
                    currentMove = random.pick(moves.nodes);
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
                    // assert(cursor.mode === CursorLocationType.Fields, "must be in fields mode");
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
    return { path, nodeField, nodeIndex, onlyRootNode: firstPath === path};
}
