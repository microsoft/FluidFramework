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

export function getRandomNodePosition(tree: ISharedTree, random: IRandom): NodeLocation {
    const moves = {
        field: ["enterNode", "nextField"],
        nodes: ["stop", "firstField"],
    };
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);

    let currentMove = "enterNode";
    let path: UpPath | undefined;
    let nodeField: FieldKey | undefined;
    let nodeIndex: number | undefined;
    let fieldNodes: number = cursor.getFieldLength();
    let isNewPath: boolean = false;
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
                    nodeField = testerKey;
                    nodeIndex = 0;
                    isNewPath = true;
                }
                break;
            case "nextField":
                if (cursor.nextField()) {
                    currentMove = random.pick(moves.field);
                    fieldNodes = cursor.getFieldLength();
                } else {
                    currentMove = "stop";
                    nodeField = testerKey;
                    nodeIndex = 0;
                    isNewPath = true;
                }
                break;
            default:
                fail(`Unexpected move ${currentMove}`);
        }
    }
    cursor.free();
    return { path, nodeField, nodeIndex, isNewPath };
}
