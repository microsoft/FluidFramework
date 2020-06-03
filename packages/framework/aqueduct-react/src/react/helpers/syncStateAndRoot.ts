/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { ISharedDirectory, SharedMap } from "@fluidframework/map";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
} from "../interface";
import { getRootFromView } from "./getRootFromView";
import { getViewFromRoot } from "./getViewFromRoot";
import { getFluidStateFromRoot } from "./getFluidStateFromRoot";
import { setFluidStateToRoot } from "./setFluidStateToRoot";
import { getComponentSchemaFromRoot } from "./getComponentSchemaFromRoot";

/**
 * Function to combine both the view and Fluid states so that they are in sync. If the update
 * is from a local update, the new Fluid state created from converting the new local view state
 * is used to update the synced Fluid state, which in turn will update the local state on other clients.
 * If it is an update triggered from a remote change on the root, the new Fluid state from the root
 * is used to overwrite the local synced state and the new local view is created accordingly.
 * @param fromRootUpdate - Is the update from a local state update or from one triggered by the root
 * @param syncedStateId - Unique ID for this synced component's state
 * @param root - The shared directory this component shared state is stored on
 * @param viewState - The current view state
 * @param setState - Callback to update the react view state
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param fluidState - The Fluid state to store on to the root, after converting components to their handles
 */
export function syncStateAndRoot<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    fromRootUpdate: boolean,
    syncedStateId,
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    viewState: SV,
    setState: (newState: SV, fromRootUpdate?: boolean, isLocal?: boolean) => void,
    fluidComponentMap: FluidComponentMap,
    fluidState: SF,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
) {
    // Use the provided fluid state if it is available, or use the one fetched from the root
    const currentRootState = fluidState || getFluidStateFromRoot(syncedStateId, root, fluidComponentMap, fluidToView);

    // Fetch the component schema
    const componentSchemaHandles = getComponentSchemaFromRoot(syncedStateId, root);
    if (componentSchemaHandles === undefined) {
        throw Error("No schema found stored on the root");
    }
    const {
        componentKeyMapHandle,
        viewMatchingMapHandle,
        fluidMatchingMapHandle,
    } = componentSchemaHandles;

    if (
        componentKeyMapHandle === undefined
        || viewMatchingMapHandle === undefined
        || fluidMatchingMapHandle === undefined) {
        throw Error("No schema handles found stored on the root");
    }
    const componentKeyMap = fluidComponentMap.get(componentKeyMapHandle.path)?.component as SharedMap;
    const viewMatchingMap = fluidComponentMap.get(viewMatchingMapHandle.path)?.component as SharedMap;
    const fluidMatchingMap = fluidComponentMap.get(fluidMatchingMapHandle.path)?.component as SharedMap;

    if (
        componentKeyMap === undefined
                || viewMatchingMap === undefined
                || fluidMatchingMap === undefined) {
        throw Error("Failed to fetch shared map DDS' from the schema handles");
    }

    // Create the combined root state by combining the current root state and the new
    // view state after it has been converted
    let combinedRootState = { ...currentRootState };
    Object.entries(viewState).forEach(([viewKey, viewValue]) => {
        const needsConverter = viewMatchingMap.get(viewKey);
        let partialRootState = {};
        if (needsConverter) {
            partialRootState = getRootFromView(
                viewState,
                viewKey as keyof SV,
                componentKeyMap,
                viewToFluid,
            );
        } else {
            partialRootState[viewKey] = viewState[viewKey];
        }
        // If it is from a root update, the values fetched from the root at the beginning overwrite those
        // created here. Otherwise, the new values overwrite those in the root
        if (fromRootUpdate) {
            combinedRootState = { ...partialRootState, ...combinedRootState };
        } else {
            combinedRootState = { ...combinedRootState, ...partialRootState };
        }
    });

    // Create the combined view state by combining the current view with the new Fluid state
    // after it has been converted
    let combinedViewState = { ...viewState, ...{ fluidComponentMap } };
    Object.entries(currentRootState).forEach(([fluidKey, fluidValue]) => {
        const needsConverter = fluidMatchingMap.get(fluidKey);
        let partialViewState = {};
        if (needsConverter) {
            partialViewState = getViewFromRoot(
                syncedStateId,
                root,
                fluidKey as keyof SF,
                fluidComponentMap,
                fluidState,
                fluidToView,
                combinedRootState,
            );
        } else {
            partialViewState[fluidKey] = currentRootState[fluidKey];
        }
        // If it is from a root update, the values converted from the root overwrite those
        // created here. Otherwise, the new view values overwrite those from the root.
        if (fromRootUpdate) {
            combinedViewState = { ...combinedViewState, ...partialViewState  };
        } else {
            combinedViewState = { ...partialViewState, ...combinedViewState };
        }
    });

    // If it is a local update, broadcast it by setting it on the root and updating locally
    // Otherwise, only update locally as the root update has already been broadcasted
    if (!fromRootUpdate) {
        setFluidStateToRoot(syncedStateId, root, runtime, fluidComponentMap, combinedRootState);
    }
    setState(combinedViewState, fromRootUpdate, true);
}
