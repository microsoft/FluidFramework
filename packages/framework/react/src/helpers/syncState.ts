/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { ISharedMap } from "@fluidframework/map";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
    ISyncedState,
} from "../interface";
import { getFluidFromView } from "./getFluidFromView";
import { getViewFromFluid } from "./getViewFromFluid";
import { getFluidState } from "./getFluidState";
import { setFluidState } from "./setFluidState";
import { getComponentSchema } from "./getComponentSchema";

/**
 * Function to combine both the view and Fluid states so that they are in sync. If the update
 * is from a local update, the new Fluid state created from converting the new local view state
 * is used to update the synced Fluid state, which in turn will update the local state on other clients.
 * If it is an update triggered from a remote change on the synced state, the new Fluid state from the synced state
 * is used to overwrite the local synced state and the new local view is created accordingly.
 * @param isSyncedStateUpdate - Is the update from a local state update or from one triggered by the synced state
 * @param syncedStateId - Unique ID for this synced component's state
 * @param syncedState - The shared map this component synced state is stored on
 * @param viewState - The current view state
 * @param setState - Callback to update the react view state
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export function syncState<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    isSyncedStateUpdate: boolean,
    syncedStateId: string,
    syncedState: ISyncedState,
    runtime: IComponentRuntime,
    viewState: SV,
    setState: (
        newState: SV,
        isSyncedStateUpdate?: boolean,
        isLocal?: boolean
    ) => void,
    fluidComponentMap: FluidComponentMap,
    fluidToView: FluidToViewMap<SV, SF>,
    viewToFluid?: ViewToFluidMap<SV, SF>,
) {
    // Use the provided fluid state if it is available, or use the one fetched from the synced state
    const currentFluidState = getFluidState(
        syncedStateId,
        syncedState,
        fluidComponentMap,
        fluidToView,
    );
    if (currentFluidState === undefined) {
        throw Error(
            "Attempted to sync view and fluid states before fluid state was initialized",
        );
    }
    // Fetch the component schema
    const componentSchemaHandles = getComponentSchema(
        syncedStateId,
        syncedState,
    );
    if (componentSchemaHandles === undefined) {
        throw Error("No schema found stored on the root");
    }
    const {
        viewMatchingMapHandle,
        fluidMatchingMapHandle,
    } = componentSchemaHandles;

    const viewMatchingMap = fluidComponentMap.get(viewMatchingMapHandle.path)
        ?.component as ISharedMap;
    const fluidMatchingMap = fluidComponentMap.get(fluidMatchingMapHandle.path)
        ?.component as ISharedMap;

    if (viewMatchingMap === undefined || fluidMatchingMap === undefined) {
        throw Error("Failed to fetch shared map DDS' from the schema handles");
    }

    // Create the combined root state by combining the current root state and the new
    // view state after it has been converted
    let combinedFluidState = { ...currentFluidState };
    Object.entries(viewState).forEach(([viewKey, viewValue]) => {
        const needsConverter = viewMatchingMap.get(viewKey);
        let partialRootState = {};
        if (needsConverter) {
            partialRootState = getFluidFromView(
                viewState,
                viewKey as keyof SV,
                currentFluidState,
                viewToFluid,
            );
        } else {
            partialRootState[viewKey] = viewState[viewKey];
        }
        // If it is from a synced state update, the values fetched from the synced state at the beginning
        // overwrite those created here. Otherwise, the new values overwrite those in the synced state
        if (isSyncedStateUpdate) {
            combinedFluidState = { ...partialRootState, ...combinedFluidState };
        } else {
            combinedFluidState = { ...combinedFluidState, ...partialRootState };
        }
    });

    // Create the combined view state by combining the current view with the new Fluid state
    // after it has been converted
    let combinedViewState = { ...viewState, ...{ fluidComponentMap } };
    Object.entries(currentFluidState).forEach(([fluidKey, fluidValue]) => {
        const needsConverter = fluidMatchingMap.get(fluidKey);
        let partialViewState = {};
        if (needsConverter) {
            partialViewState = getViewFromFluid(
                syncedStateId,
                syncedState,
                fluidKey as keyof SF,
                fluidComponentMap,
                fluidToView,
                combinedViewState,
                combinedFluidState,
            );
        } else {
            partialViewState[fluidKey] = currentFluidState[fluidKey];
        }
        // If it is from a synced state update, the values converted from the synced state overwrite those
        // created here. Otherwise, the new view values overwrite those from the synced state.
        if (isSyncedStateUpdate) {
            combinedViewState = { ...combinedViewState, ...partialViewState };
        } else {
            combinedViewState = { ...partialViewState, ...combinedViewState };
        }
    });

    // If it is a local update, broadcast it by setting it on the root and updating locally
    // Otherwise, only update locally as the root update has already been broadcasted
    if (!isSyncedStateUpdate) {
        setFluidState(
            syncedStateId,
            syncedState,
            runtime,
            fluidComponentMap,
            fluidToView,
            combinedViewState,
            combinedFluidState,
            viewToFluid,
        );
    }
    setState(combinedViewState, isSyncedStateUpdate, true);
}
