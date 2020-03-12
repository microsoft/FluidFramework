/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMap } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

/**
 * - Create a new object from the passed SharedMap.
 * - Modify the set method to call the interceptionCallback before calling set on the underlying SharedMap.
 * - The interceptionCallback and the call to the underlying SharedMap are wrapped around an
 *   orderSequentially call to batch any operations that might happen in the callback.
 *
 * @param sharedMap - The underlying SharedMap
 * @param context - The IComponentContext that will be used to call orderSequentially
 * @param interceptionCallback - The interception callback to be called
 *
 * @returns A new SharedMap that intercepts the set method and calls the interceptionCallback.
 */
export function createSharedMapWithInterception(
    sharedMap: SharedMap,
    context: IComponentContext,
    interceptionCallback: (sharedMap: SharedMap, key: string, value: any) => void): SharedMap {
    const sharedMapWithInterception = Object.create(sharedMap);

    sharedMapWithInterception.set = (key: string, value: any) => {
        let map;
        context.hostRuntime.orderSequentially(() => {
            interceptionCallback(sharedMap, key, value);
            map = sharedMap.set(key, value);
        });
        return map;
    };

    return sharedMapWithInterception as SharedMap;
}
