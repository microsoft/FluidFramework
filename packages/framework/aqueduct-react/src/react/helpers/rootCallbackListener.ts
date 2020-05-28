/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory, IDirectoryValueChanged } from "@fluidframework/map";
import {
    FluidComponentMap,
    ViewToFluidMap,
    FluidToViewMap,
} from "../interface";
import { syncStateAndRoot } from "./syncStateAndRoot";
import { getByValue } from "./utils";
import { getViewFromRoot } from "./getViewFromRoot";

/**
 * The callback that is added to the "valueChanged" event on the IComponentListened this
 * is passed in to. This will trigger state updates when the root synced state value is updated
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param syncedStateId - Unique ID for this synced component's state
 * @param root - The shared directory this component shared state is stored on
 * @param state - The current view state
 * @param setState - Callback to update the react view state
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export const rootCallbackListener = <SV,SF>(
    fluidComponentMap: FluidComponentMap,
    syncedStateId,
    root: ISharedDirectory,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
) => ((change: IDirectoryValueChanged, local: boolean) => {
    if (!local) {
        const viewToFluidKeys: string[] = viewToFluid
            ? Array.from(viewToFluid.values()).map((item) => item.rootKey as string)
            : [];
        if (change.key === `syncedState-${syncedStateId}`) {
            // If the update is to the synced Fluid state, update both the Fluid and view states
            syncStateAndRoot(
                true,
                syncedStateId,
                root,
                state,
                setState,
                fluidComponentMap,
                viewToFluid,
                fluidToView,
            );
        } else if (viewToFluid
            && (viewToFluidKeys).includes(change.key)
            || (change.keyPrefix !== undefined && viewToFluidKeys.includes(change.keyPrefix))) {
            // If the update is to a child component, trigger only a view update as the child itself will
            // update its Fluid update
            const rootKey = change.key;
            const stateKey = getByValue(rootKey, viewToFluid);
            if (stateKey) {
                const newPartialState = getViewFromRoot(
                    syncedStateId,
                    root,
                    rootKey as keyof SF,
                    fluidComponentMap,
                    fluidToView,
                );
                setState({ ...state, ...newPartialState, ...{ fluidComponentMap } }, true);
            }
        }
    }
});
