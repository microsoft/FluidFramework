/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory, IDirectoryValueChanged } from "@fluidframework/map";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import {
    FluidComponentMap,
    ViewToFluidMap,
    FluidToViewMap,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
} from "../interface";
import { syncStateAndRoot } from "./syncStateAndRoot";
import { getByValue } from "./utils";
import { getViewFromFluid } from "./getViewFromFluid";
import { getFluidStateFromRoot } from ".";

/**
 * The callback that is added to the "valueChanged" event on the IComponentListened this
 * is passed in to. This will trigger state updates when the root synced state value is updated
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param syncedStateId - Unique ID for this synced component's state
 * @param root - The shared directory this component shared state is stored on
 * @param runtime - The component runtime
 * @param state - The current view state
 * @param setState - Callback to update the react view state
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export const rootCallbackListener = <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    fluidComponentMap: FluidComponentMap,
    syncedStateId,
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean, isLocal?: boolean) => void,
    fluidToView: FluidToViewMap<SV,SF>,
    viewToFluid?: ViewToFluidMap<SV,SF>,
) => ((change: IDirectoryValueChanged, local: boolean) => {
    const currentFluidState = getFluidStateFromRoot(
        syncedStateId,
        root,
        fluidComponentMap,
        fluidToView,
    );
    if (!currentFluidState) {
        throw Error("Root update triggered before fluid state was initialized");
    }
    const rootKey = change.key;
    const viewToFluidKeys: string[] = viewToFluid
        ? Array.from(viewToFluid.values()).map((item) => item.fluidKey as string)
        : [];
    if (!local && change.key === `syncedState-${syncedStateId}`) {
        // If the update is to the synced Fluid state, update both the Fluid and view states
        syncStateAndRoot(
            true,
            syncedStateId,
            root,
            runtime,
            state,
            setState,
            fluidComponentMap,
            fluidToView,
            viewToFluid,
        );
    } else if (viewToFluid !== undefined
        && ((viewToFluidKeys).includes(rootKey)
        || (change.keyPrefix !== undefined && viewToFluidKeys.includes(change.keyPrefix)))) {
        // If the update is to a child component, trigger only a view update as the child itself will
        // update its Fluid update
        const stateKey = getByValue(rootKey, viewToFluid);
        if (stateKey) {
            const newPartialState = getViewFromFluid(
                syncedStateId,
                root,
                rootKey as keyof SF,
                fluidComponentMap,
                fluidToView,
            );
            state[stateKey as string] = newPartialState[stateKey];
            state.fluidComponentMap = fluidComponentMap;
            setState(state, true, local);
        } else {
            throw Error(`Unable to extract view state from root change key: ${rootKey}`);
        }
    }
});
