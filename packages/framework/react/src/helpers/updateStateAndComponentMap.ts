/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDirectoryValueChanged, SharedMap } from "@fluidframework/map";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
} from "../interface";
import { addComponent, asyncForEach } from "./utils";
import { syncState } from "./syncState";
import { ISyncedState } from "..";

/**
 * Add listeners too all the new handles passed in, store their respective components
 * on the fluidComponentMap, and then update both the local and synced state
 * @param newHandleList - List of IComponentHandles for new components that need to be added to the map
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param isSyncedStateUpdate - Is the update from a local state update or from one triggered by the synced state
 * @param syncedStateId - Unique ID for this synced component's state
 * @param syncedState - The shared map this component's synced state is stored on
 * @param runtime - The data store runtime
 * @param viewState - The current view state
 * @param setState - Callback to update the react view state
 * @param syncedStateCallback - The callback that will be triggered when the synced state value for the components
 * passed in changes
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export const updateStateAndComponentMap = async <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    newHandleList: IFluidHandle[],
    fluidComponentMap: FluidComponentMap,
    storedHandleMap: SharedMap,
    isSyncedStateUpdate: boolean,
    syncedStateId: string,
    syncedState: ISyncedState,
    runtime: IFluidDataStoreRuntime,
    viewState: SV,
    setState: (newState: SV, isSyncedStateUpdate?: boolean) => void,
    syncedStateCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    fluidToView: FluidToViewMap<SV, SF>,
    viewToFluid?: ViewToFluidMap<SV, SF>,
) =>
    asyncForEach(
        newHandleList,
        addComponent,
        fluidComponentMap,
        syncedStateCallback,
        () =>
            syncState(
                true,
                syncedStateId,
                syncedState,
                runtime,
                viewState,
                setState,
                fluidComponentMap,
                fluidToView,
                viewToFluid,
            ),
        storedHandleMap,
    ).then(() =>
        syncState(
            isSyncedStateUpdate,
            syncedStateId,
            syncedState,
            runtime,
            viewState,
            setState,
            fluidComponentMap,
            fluidToView,
            viewToFluid,
        ),
    );
