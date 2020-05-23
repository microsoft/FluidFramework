/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IDirectoryValueChanged } from "@microsoft/fluid-map-component-definitions";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IRootConverter,
} from "../interface";

export function getByValue<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
>(searchValue: string, map?: Map<keyof SV, IRootConverter<SV,SF>>) {
    if (map !== undefined) {
        for (const [key, value] of map.entries()) {
            if (value.rootKey === searchValue)
            {return key;}
        }
    }
}

export async function asyncForEach(
    array: (IComponentHandle | undefined)[],
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
        if (value) {
            promises.push(callback(value, fluidComponentMap, rootCallback));
        }
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
): Promise<void> => handle.get().then((component) => {
    if (component.IComponentPrimed) {
        component.IComponentPrimed.addListenerToRootValueChanged(rootCallback);
    }
    fluidComponentMap.set(handle.path, { component, isListened: true });
});

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
