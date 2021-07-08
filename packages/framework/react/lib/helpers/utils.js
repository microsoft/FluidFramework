/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export function getByFluidKey(searchValue, map) {
    for (const [key, value] of map.entries()) {
        if (value.fluidKey === searchValue) {
            return key;
        }
    }
}
export async function asyncForEach(array, callback, fluidObjectMap, syncedStateCallback, refreshView, storedHandleMap) {
    const promises = [];
    for (const value of array) {
        promises.push(callback(value, fluidObjectMap, syncedStateCallback, refreshView, storedHandleMap));
    }
    await Promise.all(promises);
}
export const addFluidObject = async (handle, fluidObjectMap, syncedStateCallback, refreshView, storedHandleMap) => {
    const maybeValue = fluidObjectMap.get(handle.absolutePath);
    let value = {
        isListened: false,
        isRuntimeMap: false,
    };
    if (maybeValue === undefined) {
        fluidObjectMap.set(handle.absolutePath, value);
    }
    else {
        value = maybeValue;
    }
    value.isListened = false;
    fluidObjectMap.set(handle.absolutePath, value);
    if (!storedHandleMap.has(handle.absolutePath)) {
        storedHandleMap.set(handle.absolutePath, handle);
    }
    return handle.get().then((fluidObject) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (value.isRuntimeMap) {
            fluidObject.on("valueChanged", syncedStateCallback);
        }
        else if (value.listenedEvents !== undefined) {
            for (const event of value.listenedEvents) {
                fluidObject.on(event, refreshView);
            }
        }
        value.fluidObject = fluidObject;
        value.isListened = true;
        fluidObjectMap.set(handle.absolutePath, value);
    });
};
export function isEquivalent(a, b) {
    if (a === undefined || b === undefined) {
        return a === b;
    }
    const aKeys = Object.getOwnPropertyNames(a);
    const bKeys = Object.getOwnPropertyNames(b);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    for (const i of aKeys) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=utils.js.map