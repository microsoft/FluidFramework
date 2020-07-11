/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { IDirectoryValueChanged, SharedMap } from "@fluidframework/map";
import { SharedObject } from "@fluidframework/shared-object-base";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IFluidConverter,
} from "../interface";
import { IFluidComponent } from "..";

export function getByFluidKey<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(searchValue: string, map: Map<keyof SV, IFluidConverter<SV, SF>>) {
    for (const [key, value] of map.entries()) {
        if (value.fluidKey === searchValue) {
            return key;
        }
    }
}

export async function asyncForEach(
    array: IFluidHandle[],
    callback: (
        handle: IFluidHandle,
        fluidComponentMap: FluidComponentMap,
        syncedStateCallback: (change: IDirectoryValueChanged, local: boolean) => void,
        refreshView: () => void,
        storedHandleMap: SharedMap,
    ) => Promise<void>,
    fluidComponentMap: FluidComponentMap,
    syncedStateCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    refreshView: () => void,
    storedHandleMap: SharedMap,
): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const value of array) {
        promises.push(
            callback(value, fluidComponentMap, syncedStateCallback, refreshView, storedHandleMap),
        );
    }
    await Promise.all(promises);
}

export const addComponent = async <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    handle: IFluidHandle,
    fluidComponentMap: FluidComponentMap,
    syncedStateCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    refreshView: () => void,
    storedHandleMap: SharedMap,
): Promise<void> => {
    const maybeValue: IFluidComponent | undefined = fluidComponentMap.get(handle.absolutePath);
    let value: IFluidComponent = {
        isListened: false,
        isRuntimeMap: false,
    };
    if (maybeValue === undefined) {
        fluidComponentMap.set(
            handle.absolutePath,
            value,
        );
    } else {
        value = maybeValue;
    }
    value.isListened = false;
    fluidComponentMap.set(handle.absolutePath, value);
    if (!storedHandleMap.has(handle.absolutePath)) {
        storedHandleMap.set(handle.absolutePath, handle);
    }
    return handle.get().then((component) => {
        if (value.isRuntimeMap) {
            (component as SharedMap).on("valueChanged", syncedStateCallback);
        } else if (value.listenedEvents) {
            for (const event of value.listenedEvents) {
                (component as SharedObject).on(event, refreshView);
            }
        }
        value.component = component;
        value.isListened = true;
        fluidComponentMap.set(handle.absolutePath, value);
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
