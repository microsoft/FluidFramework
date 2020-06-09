/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDirectoryValueChanged, ISharedDirectory } from "@fluidframework/map";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
} from "../interface";
import { addComponent, asyncForEach } from "./utils";
import { syncStateAndRoot } from "./syncStateAndRoot";

/**
 * Add listeners too all the new handles passed in, store their respective components
 * on the fluidComponentMap, and then update both the local and synced state
 * @param newHandleList - List of IComponentHandles for new components that need to be added to the map
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param fromRootUpdate - Is the update from a local state update or from one triggered by the root
 * @param syncedStateId - Unique ID for this synced component's state
 * @param root - The shared directory this component shared state is stored on
 * @param runtime - The component runtime
 * @param viewState - The current view state
 * @param setState - Callback to update the react view state
 * @param rootCallback - The callback that will be triggered when the root value for the components passed in changes
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export const updateStateAndComponentMap = async <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    newHandleList: IComponentHandle[],
    fluidComponentMap: FluidComponentMap,
    fromRootUpdate: boolean,
    syncedStateId: string,
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    viewState: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    fluidToView: FluidToViewMap<SV, SF>,
    viewToFluid?: ViewToFluidMap<SV, SF>,
) =>
    asyncForEach(
        newHandleList,
        addComponent,
        fluidComponentMap,
        rootCallback,
        () =>
            syncStateAndRoot(
                true,
                syncedStateId,
                root,
                runtime,
                viewState,
                setState,
                fluidComponentMap,
                fluidToView,
                viewToFluid,
            ),
    ).then(() =>
        syncStateAndRoot(
            fromRootUpdate,
            syncedStateId,
            root,
            runtime,
            viewState,
            setState,
            fluidComponentMap,
            fluidToView,
            viewToFluid,
        ),
    );
