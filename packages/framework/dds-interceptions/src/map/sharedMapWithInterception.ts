/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

//import * as assert from "assert";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

/**
 * - Create a new object from the passed SharedMap.
 * - Modify the set method to call the setInterceptionCallback before calling set on the underlying SharedMap.
 * - The setInterceptionCallback and the call to the underlying SharedMap are wrapped around an
 *   orderSequentially call to batch any operations that might happen in the callback.
 *
 * @param sharedMap - The underlying SharedMap
 * @param context - The IComponentContext that will be used to call orderSequentially
 * @param setInterceptionCallback - The interception callback to be called
 *
 * @returns A new SharedMap that intercepts the set method and calls the setInterceptionCallback.
 */
export function createSharedMapWithInterception(
    sharedMap: SharedMap,
    context: IComponentContext,
    setInterceptionCallback: (sharedMap: ISharedMap, key: string, value: any) => void): SharedMap {
    const sharedMapWithInterception = Object.create(sharedMap);

    // executingCallback keeps track of whether set is called from the setInterceptionCallback. In that case,
    // we do not call the callback again because that would result in infinite recursion. We will still set
    // the key to keep the behavior similar to if set was called on the underlying SharedMap.
    let executingCallback: boolean = false;

    sharedMapWithInterception.set = (key: string, value: any) => {
        let map;
        context.hostRuntime.orderSequentially(() => {
            map = sharedMap.set(key, value);
            // If we are in the middle of executing a previous callback, do not call it again.
            if (!executingCallback) {
                executingCallback = true;
                setInterceptionCallback(sharedMap, key, value);
                executingCallback = false;
            }
        });
        return map;
    };

    return sharedMapWithInterception as SharedMap;
}
