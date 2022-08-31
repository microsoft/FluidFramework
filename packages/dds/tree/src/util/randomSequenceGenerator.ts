/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { AnchorSet, Delta, FieldKey, UpPath } from "../tree";
import { SequenceEditBuilder, singleTextCursor } from "../feature-libraries";
import { jsonString } from "../domains";
import { Transposed as T } from "../changeset";
import { brand } from ".";

// generate random UpPath objects
export function generateRandomUpPaths(
    parentKey: FieldKey, seed: number, maxUpPaths: number): Set<UpPath> {
    const rootKey = brand<FieldKey>("root");
    // initialize root UpPath
    const root: UpPath = {
        parent: undefined,
        parentField: rootKey,
        parentIndex: 0,
    };

    // initialize set to keep track of all upPaths created
    const parents = new Set([root]);

    // loop through to create more upPaths
    for (let i = 0; i < (seed % maxUpPaths); i++) {
        const currParent = getRandomParent(parents, makeRandom(seed + i).integer(1, 10000000));
        const currUpPath: UpPath = {
            parent: currParent,
            parentField: parentKey,
            parentIndex: i,
        };
        parents.add(currUpPath);
    }

    return parents;
}

function getRandomParent(parentSet: Set<UpPath>, seed: number): UpPath {
    const parents = Array.from(parentSet);
    const randomIndex = makeRandom(seed).integer(1, 10000000);
    return parents[randomIndex % parents.length];
}

export function generateRandomChange(upPaths: Set<UpPath>, seed: number): T.LocalChangeset[] {
    const deltas: Delta.Root[] = [];
    const builder = new SequenceEditBuilder(deltas.push.bind(deltas), new AnchorSet());
    const operations = ["setValue", "delete", "insert"];
    const nodeX = { type: jsonString.name, value: "X" };
    const randomIndex = makeRandom(seed).integer(1, 10000000);
    const currOperation = operations[randomIndex % operations.length];
    if (currOperation === "setValue") {
        builder.setValue(getRandomParent(upPaths, randomIndex), randomIndex);
    }
    if (currOperation === "insert") {
        builder.insert(getRandomParent(upPaths, randomIndex), singleTextCursor(nodeX));
    }
    if (currOperation === "delete") {
        builder.delete(getRandomParent(upPaths, randomIndex), makeRandom(seed).integer(1, upPaths.size));
    }

    return builder.getChanges();
}
