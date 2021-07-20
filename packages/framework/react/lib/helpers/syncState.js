/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { getFluidFromView } from "./getFluidFromView";
import { getViewFromFluid } from "./getViewFromFluid";
import { getFluidState } from "./getFluidState";
import { setFluidState } from "./setFluidState";
import { getSchema } from "./getSchema";
/**
 * Function to combine both the view and Fluid states so that they are in sync. If the update
 * is from a local update, the new Fluid state created from converting the new local view state
 * is used to update the synced Fluid state, which in turn will update the local state on other clients.
 * If it is an update triggered from a remote change on the synced state, the new Fluid state from the synced state
 * is used to overwrite the local synced state and the new local view is created accordingly.
 * @param isSyncedStateUpdate - Is the update from a local state update or from one triggered by the synced state
 * @param syncedStateId - Unique ID for this synced Fluid object's state
 * @param syncedState - The shared map this Fluid object synced state is stored on
 * @param viewState - The current view state
 * @param setState - Callback to update the react view state
 * @param fluidObjectMap - A map of Fluid handle paths to their Fluid objects
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export function syncState(isSyncedStateUpdate, syncedStateId, syncedState, runtime, viewState, setState, fluidObjectMap, fluidToView, viewToFluid) {
    var _a, _b;
    // Use the provided Fluid state if it is available, or use the one fetched from the synced state
    const currentFluidState = getFluidState(syncedStateId, syncedState, fluidObjectMap, fluidToView);
    if (currentFluidState === undefined) {
        throw Error("Attempted to sync view and Fluid states before Fluid state was initialized");
    }
    // Fetch the schema
    const schemaHandles = getSchema(syncedStateId, syncedState);
    if (schemaHandles === undefined) {
        throw Error("No schema found stored on the root");
    }
    const { viewMatchingMapHandle, fluidMatchingMapHandle, } = schemaHandles;
    const viewMatchingMap = (_a = fluidObjectMap.get(viewMatchingMapHandle.absolutePath)) === null || _a === void 0 ? void 0 : _a.fluidObject;
    const fluidMatchingMap = (_b = fluidObjectMap.get(fluidMatchingMapHandle.absolutePath)) === null || _b === void 0 ? void 0 : _b.fluidObject;
    if (viewMatchingMap === undefined || fluidMatchingMap === undefined) {
        throw Error("Failed to fetch shared map DDSes from the schema handles");
    }
    // Create the combined root state by combining the current root state and the new
    // view state after it has been converted
    let combinedFluidState = Object.assign({}, currentFluidState);
    Object.entries(viewState).forEach(([viewKey, viewValue]) => {
        const needsConverter = viewMatchingMap.get(viewKey);
        let partialRootState = {};
        if (needsConverter !== undefined) {
            partialRootState = getFluidFromView(viewState, viewKey, currentFluidState, viewToFluid);
        }
        else {
            partialRootState[viewKey] = viewState[viewKey];
        }
        // If it is from a synced state update, the values fetched from the synced state at the beginning
        // overwrite those created here. Otherwise, the new values overwrite those in the synced state
        if (isSyncedStateUpdate) {
            combinedFluidState = Object.assign(Object.assign({}, partialRootState), combinedFluidState);
        }
        else {
            combinedFluidState = Object.assign(Object.assign({}, combinedFluidState), partialRootState);
        }
    });
    // Create the combined view state by combining the current view with the new Fluid state
    // after it has been converted
    let combinedViewState = Object.assign(Object.assign({}, viewState), { fluidObjectMap });
    Object.entries(currentFluidState).forEach(([fluidKey, fluidValue]) => {
        const needsConverter = fluidMatchingMap.get(fluidKey);
        let partialViewState = {};
        if (needsConverter !== undefined) {
            partialViewState = getViewFromFluid(syncedStateId, syncedState, fluidKey, fluidObjectMap, fluidToView, combinedViewState, combinedFluidState);
        }
        else {
            partialViewState[fluidKey] = currentFluidState[fluidKey];
        }
        // If it is from a synced state update, the values converted from the synced state overwrite those
        // created here. Otherwise, the new view values overwrite those from the synced state.
        if (isSyncedStateUpdate) {
            combinedViewState = Object.assign(Object.assign({}, combinedViewState), partialViewState);
        }
        else {
            combinedViewState = Object.assign(Object.assign({}, partialViewState), combinedViewState);
        }
    });
    // If it is a local update, broadcast it by setting it on the root and updating locally
    // Otherwise, only update locally as the root update has already been broadcasted
    if (!isSyncedStateUpdate) {
        setFluidState(syncedStateId, syncedState, runtime, fluidObjectMap, fluidToView, combinedViewState, combinedFluidState, viewToFluid);
    }
    setState(combinedViewState, isSyncedStateUpdate, true);
}
//# sourceMappingURL=syncState.js.map