/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
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
export function getViewFromFluid(syncedStateId, syncedState, fluidKey, fluidObjectMap, fluidToView, viewState, combinedFluidState) {
    var _a, _b;
    const fluidObjectState = getFluidState(syncedStateId, syncedState, fluidObjectMap, fluidToView);
    if (fluidObjectState === undefined) {
        throw Error("Attempted to fetch view from Fluid state before it was initialized");
    }
    let value = fluidObjectState[fluidKey];
    if (combinedFluidState !== undefined) {
        value = (_a = combinedFluidState[fluidKey]) !== null && _a !== void 0 ? _a : value;
    }
    const viewConverter = (_b = fluidToView.get(fluidKey)) === null || _b === void 0 ? void 0 : _b.viewConverter;
    if (viewConverter !== undefined) {
        const partialFluidState = {};
        partialFluidState[fluidKey] = value;
        return viewConverter(viewState, partialFluidState, fluidObjectMap);
    }
    else {
        const partialViewState = {};
        const valueAsIFluidHandle = value.IFluidHandle;
        const convertedValue = valueAsIFluidHandle !== undefined
            ? fluidObjectMap.get(valueAsIFluidHandle.absolutePath)
            : value;
        partialViewState[fluidKey] = convertedValue;
        return partialViewState;
    }
}
//# sourceMappingURL=getViewFromFluid.js.map