/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IDirectoryValueChanged, SharedMap } from "@fluidframework/map";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IFluidConverter,
} from "../interface";

export function getByValue<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
>(searchValue: string, map?: Map<keyof SV, IFluidConverter<SV,SF>>) {
    if (map !== undefined) {
        for (const [key, value] of map.entries()) {
            if (value.fluidKey === searchValue)
            {return key;}
        }
    }
}

export async function asyncForEach(
    array: IComponentHandle[],
    callback: (
        handle: IComponentHandle,
        fluidComponentMap: FluidComponentMap,
        rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    ) => Promise<void>,
    fluidComponentMap: FluidComponentMap,
    rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const value of array) {
        promises.push(callback(value, fluidComponentMap, rootCallback));
    }
    await Promise.all(promises);
}

export const addComponent = async <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> (
    handle: IComponentHandle,
    fluidComponentMap: FluidComponentMap,
    rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
): Promise<void> => {
    const existingValue = fluidComponentMap.get(handle.path);
    const isRuntimeMap = existingValue !== undefined && existingValue.isRuntimeMap;
    fluidComponentMap.set(handle.path, { isListened: false });
    return handle.get().then((component) => {
        if (component.IComponentListened) {
            component.IComponentListened.addListenerToRootValueChanged(rootCallback);
        } else if (isRuntimeMap) {
            (component as SharedMap).on("valueChanged", rootCallback);
        }
        fluidComponentMap.set(handle.path, { component, isListened: true, isRuntimeMap });
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
