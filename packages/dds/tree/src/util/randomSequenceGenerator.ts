/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { AnchorSet, FieldKey, UpPath } from "../tree";
import { SequenceEditBuilder, singleTextCursor } from "../feature-libraries";
import { jsonString } from "../domains";
import { Transposed as T } from "../changeset";
import { brand } from ".";

/**
 *
 * @param parentKey - parentKey used for creating the object for the parentField.
 * @param seed - seed used to randomly select the location for the UpPath objects.
 * @param maxUpPaths - maximum number of UpPaths generated during the function call.
 * @returns - set of UpPaths representing the randomnly generated tree.
 */
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

/**
 *
 * @param parentSet - set of the UpPaths to select a random parent from.
 * @param seed - random seed used to select a parent.
 * @returns - randomly selected parent from the set.
 */
function getRandomParent(parentSet: Set<UpPath>, seed: number): UpPath {
    const parents = Array.from(parentSet);
    const randomIndex = makeRandom(seed).integer(1, 10000000);
    return parents[randomIndex % parents.length];
}

/**
 *
 * @param upPaths - Set of UpPaths which represents the state of the tree.
 * @param seed - random seed used to generate the change.
 * @returns randomly generated change.
 */
export function generateRandomChange(upPaths: Set<UpPath>, seed: number): T.LocalChangeset {
    const builder = new SequenceEditBuilder(() => {}, new AnchorSet());
    const operations = ["setValue", "delete", "insert"];
    const nodeX = { type: jsonString.name, value: "X" };
    const randomIndex = makeRandom(seed).integer(1, 10000000);
    const currOperation = operations[randomIndex % operations.length];
    if (currOperation === "setValue") {
        builder.setValue(getRandomParent(upPaths, randomIndex), randomIndex);
    } else if (currOperation === "insert") {
        builder.insert(getRandomParent(upPaths, randomIndex), singleTextCursor(nodeX));
    } else {
        builder.delete(getRandomParent(upPaths, randomIndex), makeRandom(seed).integer(1, upPaths.size));
    }

    return builder.getChanges()[0];
}
