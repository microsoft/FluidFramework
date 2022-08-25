/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSet, Delta, FieldKey, UpPath } from "../tree";
import { SequenceEditBuilder, singleTextCursor } from "../feature-libraries";
import { jsonString } from "../domains";
import { brand } from ".";

// generate random UpPath objects
const rootKey = brand<FieldKey>("root");

export function generateRandomUpPath(parentKey: FieldKey): Set<UpPath> {
    // initialize root UpPath
    const root: UpPath = {
        parent: undefined,
        parentField: rootKey,
        parentIndex: 0,
    };

    // initialize set to keep track of all upPaths created
    const parents = new Set([root]);
    const parentIndices = new Map<UpPath, number[]>();
    parentIndices.set(root, [0]);

    // loop through to create 10 more upPaths (arbitrary size)
    for (let i = 0; i < 10; i++) {
        const currParent = getRandomParent(parents);

        let currParentIndex = Math.floor((Math.random() * 100) + 1);
        while (parentIndices.get(currParent)?.includes(currParentIndex)) {
            currParentIndex = Math.floor((Math.random() * 100) + 1);
        }
        const currUpPath: UpPath = {
            parent: currParent,
            parentField: parentKey,
            parentIndex: currParentIndex,
        };
        parents.add(currUpPath);
        parentIndices.get(currParent)?.push(currParentIndex);
    }

    return parents;
}

export function getRandomParent(parentSet: Set<UpPath>): UpPath {
    const parents = Array.from(parentSet);
    return parents[Math.floor(Math.random() * parents.length)];
}

export function generateRandomOperation(upPaths: Set<UpPath>): Delta.Root[] {
    const deltas: Delta.Root[] = [];
    const builder = new SequenceEditBuilder(deltas.push.bind(deltas), new AnchorSet());
    const operations = ["setValue", "delete", "insert"];
    const nodeX = { type: jsonString.name, value: "X" };

    const currOperation = operations[Math.floor((Math.random() * operations.length))];
    if (currOperation === "setValue") {
        builder.setValue(getRandomParent(upPaths), Math.floor((Math.random() * 100) + 1));
    }
    if (currOperation === "insert") {
        builder.insert(getRandomParent(upPaths), singleTextCursor(nodeX));
    }
    if (currOperation === "delete") {
        builder.delete(getRandomParent(upPaths), Math.floor((Math.random() * 100) + 1));
    }

    return deltas;
}
