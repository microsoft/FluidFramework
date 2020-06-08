/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IDirectoryValueChanged, SharedMap } from "@fluidframework/map";
import { SharedObject } from "@fluidframework/shared-object-base";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IFluidConverter,
} from "../interface";

export function getByFluidKey<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
>(searchValue: string, map: Map<keyof SV, IFluidConverter<SV,SF>>) {
    for (const [key, value] of map.entries()) {
        if (value.fluidKey === searchValue)
        {
            return key;
        }
    }
}

export async function asyncForEach(
    array: IComponentHandle[],
    callback: (
        handle: IComponentHandle,
        fluidComponentMap: FluidComponentMap,
        rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
        refreshView: () => void,
    ) => Promise<void>,
    fluidComponentMap: FluidComponentMap,
    rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    refreshView: () => void,
): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const value of array) {
        promises.push(callback(value, fluidComponentMap, rootCallback, refreshView));
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
    refreshView: () => void,
): Promise<void> => {
    const value = fluidComponentMap.get(handle.path);
    if (!value) {
        throw Error("Tried fetch a component that wasn't present on the fluid component map");
    }
    value.isListened = false;
    fluidComponentMap.set(handle.path, value);
    return handle.get().then((component) => {
        if (value.isRuntimeMap) {
            (component as SharedMap).on("valueChanged", rootCallback);
        } else if (value.listenedEvents) {
            for (const event of value.listenedEvents) {
                (component as SharedObject).on(event, refreshView);
            }
        }
        value.component = component;
        value.isListened = true;
        fluidComponentMap.set(handle.path, value);
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
