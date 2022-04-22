/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import {
    FluidObjectMap,
    IViewConverter,
    IViewState,
    IFluidState,
    ISyncedState,
} from "../interface";
import { getFluidState } from "./getFluidState";

/**
 * Return a partial view state containing the Fluid state key identified converted into its
 * corresponding view state value in the partial view state returned
 * @param syncedStateId - Unique ID for the synced state of this view
 * @param syncedState - The shared map this shared state is stored on
 * @param fluidKey - The key of the value within the Fluid state that we want converted
 * @param fluidObjectMap - A map of Fluid handle paths to their Fluid objects
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param combinedFluidState - Optional param containing the combined Fluid state so far to fetch from
 */
export function getViewFromFluid<
    SV extends IViewState,
    SF extends IFluidState
>(
    syncedStateId: string,
    syncedState: ISyncedState,
    fluidKey: keyof SF,
    fluidObjectMap: FluidObjectMap,
    fluidToView: Map<keyof SF, IViewConverter<SV, SF>>,
    viewState: SV,
    combinedFluidState?: Partial<SF>,
): Partial<SV> {
    const fluidObjectState = getFluidState(
        syncedStateId,
        syncedState,
        fluidObjectMap,
        fluidToView,
    );
    if (fluidObjectState === undefined) {
        throw Error(
            "Attempted to fetch view from Fluid state before it was initialized",
        );
    }
    let value = fluidObjectState[fluidKey];
    if (combinedFluidState !== undefined) {
        value = combinedFluidState[fluidKey] ?? value;
    }
    const viewConverter = fluidToView.get(fluidKey)?.viewConverter;
    if (viewConverter !== undefined) {
        const partialFluidState: Partial<SF> = {};
        partialFluidState[fluidKey] = value;
        return viewConverter(viewState, partialFluidState, fluidObjectMap);
    } else {
        const partialViewState: Partial<SV> = {};
        const valueAsIFluidHandle: FluidObject<IFluidHandle> = value;
        const convertedValue = valueAsIFluidHandle.IFluidHandle !== undefined
            ? fluidObjectMap.get(valueAsIFluidHandle.IFluidHandle.absolutePath)
            : value;
        partialViewState[fluidKey as string] = convertedValue;
        return partialViewState;
    }
}
