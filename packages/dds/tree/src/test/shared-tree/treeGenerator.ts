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

const paths = new Map<any, number[][]>();
paths.set(JSON.stringify(rootPath), [[0, 42]]);

export function treeGenerator(state=paths): any {
    let treeType = random.pick(['leaf', 'stick', 'balanced'])
    treeType = 'balanced'
    const keys = Array.from(state.keys());
    const parentPath = random.pick(keys)
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
    const indices = state.get(path)
    const index = indices[random.integer(0, indices.length-1)][0]
    // TODO: parent field must be randomly chosen
    const parentPath = addIndexToPath(JSON.parse(path), index)
    const newPath = {
        parent: parentPath,
        parentField: "rootFieldKeySymbol"
    }
    const key = JSON.stringify(newPath);
    if (state.has(key)){
        addLeaf(state, newPath)
    } else {
        state.set(
            key,[[1, random.integer(0, Number.MAX_SAFE_INTEGER)]]
        )
    }
    return state
}

function addBalanced(state: any, path:any): any{
    const indices = state.get(path)
    const index = indices[random.integer(0, indices.length-1)][0]
    // TODO: parent field must be randomly chosen
    const parentPath = addIndexToPath(JSON.parse(path), index)
    const newPath = {
        parent: parentPath,
        parentField: "rootFieldKeySymbol"
    }
    const key = JSON.stringify(newPath);
    if (state.has(key)){
        addLeaf(state, newPath)
        addLeaf(state, newPath)
    } else {
        state.set(
            key,
            [
                [0, random.integer(0, Number.MAX_SAFE_INTEGER)],
                [1, random.integer(0, Number.MAX_SAFE_INTEGER)]
            ]
        )
    }
    return state
}

function addIndexToPath(path:any, index:number): any {
    const newPath = {
        parent: path.parent,
        parentField: path.parentField,
        parentIndex: index
    }
    return newPath
}

function getMaxIndex(indices:number[][]): number {
    let maxIndex = 0;
    for (const index of indices) {
        maxIndex = Math.max(maxIndex, index[0])
    }
    return maxIndex;
}
