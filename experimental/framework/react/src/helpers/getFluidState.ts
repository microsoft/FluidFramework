/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FluidObject,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    IViewConverter,
    FluidObjectMap,
    IViewState,
    IFluidState,
    ISyncedState,
    IFluidObjectMapItem,
} from "..";

/**
 * Return the Fluid state from the syncedState with all handles converted into Fluid objects
 * @param syncedStateId - Unique ID for the synced state of this view
 * @param syncedState - Shared map the synced state is stored on
 * @param fluidObjectMap - Map of Fluid handle paths to their respective Fluid objects
 * @param fluidToView - Map of the Fluid state keys contains the optional syncedState key parameter,
 * in case the Fluid value is stored in the syncedState under a different key
 */
export function getFluidState<
    SV extends IViewState,
    SF extends IFluidState
>(
    syncedStateId: string,
    syncedState: ISyncedState,
    fluidObjectMap: FluidObjectMap,
    fluidToView?: Map<keyof SF, IViewConverter<SV, SF>>,
): SF | undefined {
    const fluidObjectStateHandle = syncedState.get<IFluidHandle<ISharedMap>>(
        `syncedState-${syncedStateId}`,
    );
    if (fluidObjectStateHandle === undefined) {
        return;
    }
    const fluidObjectState = fluidObjectMap.get(fluidObjectStateHandle.absolutePath)
        ?.fluidObject as SharedMap;
    if (fluidObjectState === undefined) {
        return;
    }
    const fluidState = {};
    for (const fluidKey of fluidObjectState.keys()) {
        const createCallback = fluidToView?.get(fluidKey as keyof SF)
            ?.sharedObjectCreate;
        let value = fluidObjectState.get(fluidKey);
        if (value !== undefined && createCallback !== undefined) {
            const handle: FluidObject<IFluidHandle> = value;
            const possibleFluidObjectId = handle?.IFluidHandle?.absolutePath;
            if (possibleFluidObjectId !== undefined) {
                value = (fluidObjectMap.get(possibleFluidObjectId)) as IFluidObjectMapItem;
                fluidState[fluidKey] = value?.fluidObject;
            } else {
                fluidState[fluidKey] = value;
            }
        } else {
            fluidState[fluidKey] = value;
        }
    }
    return fluidState as SF;
}
