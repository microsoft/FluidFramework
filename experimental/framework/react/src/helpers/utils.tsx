/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IDirectoryValueChanged, SharedMap } from "@fluidframework/map";
import { SharedObject } from "@fluidframework/shared-object-base";
import {
    FluidObjectMap,
    IFluidState,
    IViewState,
    IFluidConverter,
} from "../interface";
import { IFluidObjectMapItem } from "..";

export function getByFluidKey<
    SV extends IViewState,
    SF extends IFluidState
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
        fluidObjectMap: FluidObjectMap,
        syncedStateCallback: (change: IDirectoryValueChanged, local: boolean) => void,
        refreshView: () => void,
        storedHandleMap: SharedMap,
    ) => Promise<void>,
    fluidObjectMap: FluidObjectMap,
    syncedStateCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    refreshView: () => void,
    storedHandleMap: SharedMap,
): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const value of array) {
        promises.push(
            callback(value, fluidObjectMap, syncedStateCallback, refreshView, storedHandleMap),
        );
    }
    await Promise.all(promises);
}

export const addFluidObject = async <
    SV extends IViewState,
    SF extends IFluidState
>(
    handle: IFluidHandle,
    fluidObjectMap: FluidObjectMap,
    syncedStateCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    refreshView: () => void,
    storedHandleMap: SharedMap,
): Promise<void> => {
    const maybeValue: IFluidObjectMapItem | undefined = fluidObjectMap.get(handle.absolutePath);
    let value: IFluidObjectMapItem = {
        isListened: false,
        isRuntimeMap: false,
    };
    if (maybeValue === undefined) {
        fluidObjectMap.set(
            handle.absolutePath,
            value,
        );
    } else {
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
            (fluidObject as SharedMap).on("valueChanged", syncedStateCallback);
        } else if (value.listenedEvents !== undefined) {
            for (const event of value.listenedEvents) {
                (fluidObject as SharedObject).on(event, refreshView);
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
