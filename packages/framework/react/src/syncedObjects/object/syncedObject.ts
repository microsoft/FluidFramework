/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SyncedComponent } from "../..";
import { useStateFluid } from "../../useStateFluid";
import { ISyncedMapState } from "./interface";

/**
 * Function to set the config for any type T object on a syncedComponent's SharedMap synced state
 * @param syncedComponent - The Fluid component on which the synced state config is being set
 * @param syncedStateId - The ID of the view state that this config schema is being set for
 * @param defaultValue - The default value of type T that the state will be initialized with prior to
 * Fluid initialization
 */
export function setSyncedObjectConfig<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: T,
) {
    syncedComponent.setConfig<ISyncedMapState<T>>(syncedStateId, {
        syncedStateId,
        fluidToView: new Map([
            [
                "value", {
                    type: "any",
                    viewKey: "value",
                },
            ],
        ]) as any,
        defaultViewState: { value: defaultValue },
    });
}

/**
 * Function to use the synced state of type T that has been prepared for this view
 * @param syncedComponent - The Fluid component that holds the synced state config for this view
 * @param syncedStateId - The ID of this view state
 * @param defaultValue - The default value of type T that the view state will be initialized with
 * @returns [the initialized synced state of type T, a synced setState call for the state]
 */
export function useSyncedObject<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: T,
): [T, (newState: T) => void] {
    const [state, setState] = useStateFluid<ISyncedMapState<T>, ISyncedMapState<T>>(
        {
            syncedComponent,
            syncedStateId,
        }, { value: defaultValue },
    );
    return [state.value, (newState: T) => setState({ value: newState })];
}
