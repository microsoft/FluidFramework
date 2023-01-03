import { strict as assert } from "assert";
import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { moveToDetachedField } from "../../forest";
import { ISharedTree } from "../../shared-tree";
import { FieldKey, UpPath } from "../../tree";
import { brand, fail } from "../../util";

export interface NodeLocation {
    path: UpPath | undefined;
    nodeField: FieldKey | undefined;
    nodeIndex: number | undefined;
    isNewPath: boolean;
}

export function getRandomNodePosition(tree: ISharedTree, random: IRandom, existingPath = false): NodeLocation {
    const moves = {
        field: ["enterNode", "nextField"],
        nodes: ["stop", "firstField"],
    };
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    const firstNode = cursor.firstNode();
    cursor.firstField();
    const firstField = cursor.getFieldKey();
    const firstFieldNodes = cursor.getFieldLength();

    assert(firstNode !== undefined, "tree must contain at least one node");
    assert(firstField !== undefined);
    assert(firstFieldNodes > 0);

    let fieldNodes: number = firstFieldNodes;
    let path: UpPath | undefined;
    let nodeField: FieldKey = firstField;
    let nodeIndex: number = fieldNodes;
    let isNewPath: boolean = false;

    let currentMove = "enterNode";
    const testerKey: FieldKey = brand("Test");

    while (currentMove !== "stop") {
        switch (currentMove) {
            case "enterNode":
                if (fieldNodes > 0) {
                    nodeIndex = random.integer(0, fieldNodes - 1);
                    cursor.enterNode(nodeIndex);
                    path = cursor.getPath();
                    nodeField = cursor.getFieldKey();
                    currentMove = random.pick(moves.nodes);
                    if (currentMove === "stop") {
                        cursor.enterField(nodeField);
                        nodeIndex = cursor.getFieldLength();
                    }
                } else {
                    currentMove = random.pick(moves.nodes);
                }
                break;
            case "firstField":
                if (cursor.firstField()) {
                    currentMove = random.pick(moves.field);
                    fieldNodes = cursor.getFieldLength();
                } else {
                    currentMove = "stop";
                    if (!existingPath) {
                        nodeField = testerKey;
                        nodeIndex = 0;
                        isNewPath = true;
                    }
                }
                break;
            case "nextField":
                if (cursor.nextField()) {
                    currentMove = random.pick(moves.field);
                    fieldNodes = cursor.getFieldLength();
                } else {
                    currentMove = "stop";
                    if (!existingPath) {
                        nodeField = testerKey;
                        nodeIndex = 0;
                        isNewPath = true;
                    }
                }
                break;
            default:
                fail(`Unexpected move ${currentMove}`);
        }
    }
    cursor.free();
    return { path, nodeField, nodeIndex, isNewPath };
}
