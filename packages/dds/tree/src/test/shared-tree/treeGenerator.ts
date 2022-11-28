/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils"
import { fail } from "../../util";

const random = makeRandom(0);

const rootPath = {
    parent: "undefined",
    parentField: "rootFieldKeySymbol",
};

const paths = new Map();
paths.set(JSON.stringify(rootPath), [[0, 42]]);

export function treeGenerator(state=paths): any {
    const treeType = random.pick(['leaf', 'stick', 'balanced'])
    const keys = Array.from(state.keys());
    const parentPath = JSON.parse(random.pick(keys))

    switch (treeType) {
        // add one node at the parentPath
        case 'leaf':
            return addLeaf(state, parentPath)
        case 'stick':
            return addStick(state, parentPath)
        case 'balanced':
            return addBalanced(state, parentPath)
        default:
            fail(`Unexpected treeType ${treeType}`);
    }
}

function addLeaf(state: any, path:any): any{
    const key = JSON.stringify(path);
    const indices = state.get(key)
    const index = getMaxIndex(indices) + 1
    const value = random.integer(0, Number.MAX_SAFE_INTEGER)
    indices.push([index, value])
    state.set(key, indices)
    return state
}

function addStick(state: any, path:any): any{
    const newPath = {
        parent: path,
        parentField: "rootFieldKeySymbol"
    }
    const key = JSON.stringify(newPath);
    if (state.has(key)){
        addLeaf(state, newPath)
    } else {
        state.set(key, [0, random.integer(0, Number.MAX_SAFE_INTEGER)])
    }
    return state
}

function addBalanced(state: any, path:any): any{
    // TODO: parent field must be randomly chosen
    const newPath = {
        parent: path,
        parentField: "rootFieldKeySymbol"
    }
    const key = JSON.stringify(newPath);
    if (state.has(key)){
        addLeaf(state, newPath)
        addLeaf(state, newPath)
    } else {
        state.set(key, [0, random.integer(0, Number.MAX_SAFE_INTEGER)])
    }
    return state
}

function getMaxIndex(indices:number[][]): number {
    let maxIndex = 0;
    for (const index of indices) {
        maxIndex = Math.max(maxIndex, index[0])
    }
    return maxIndex;
}
