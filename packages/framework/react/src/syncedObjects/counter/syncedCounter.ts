/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { SharedCounter } from "@fluidframework/counter";
import { SyncedComponent } from "../..";
import {
    ISyncedCounterViewState,
    ISyncedCounterFluidState,
    ISyncedCounterReducer,
} from "./interface";
import {
    setFluidSyncedCounterConfig,
    useSyncedCounterReducerFluid,
    generateCounterFluidToViewConvertor,
} from "./fluidSyncedCounter";

export const generateCounter = () => generateCounterFluidToViewConvertor<
    ISyncedCounterFluidState,
    ISyncedCounterFluidState
>("counter", "counter");

/**
 * Function to set the config for a synced counter on a syncedComponent's SharedMap synced state. This
 * will initialize and provide a SharedCount for the view to use. This SharedString provided is automatically
 * bound to the state update of the functional view useSyncedCounter is called in.
 * @param syncedComponent - The Fluid component on which the synced state config is being set
 * @param syncedStateId - The ID of the view state that this config schema is being set for
 * @param defaultValue - The default number the view value will be set to prior to the Fluid counter initializing
 * @param sharedObjectCreate - The creation function for the SharedCounter. This can be set to pre-increment the counter
 */
export function setSyncedCounterConfig(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: number = 0,
    sharedObjectCreate: (runtime: IComponentRuntime) => SharedCounter = SharedCounter.create,
) {
    setFluidSyncedCounterConfig<
        ISyncedCounterViewState,
        ISyncedCounterFluidState
    >(
        syncedComponent,
        syncedStateId,
        "value",
        "counter",
        { value: defaultValue },
        sharedObjectCreate,
    );
}

/**
 * Function to use the synced counter state powered by a SharedCounter that has been prepared for this view
 * @param syncedComponent - The Fluid component that holds the synced state config for this view
 * @param syncedStateId - The ID of this view state
 * @returns [
 *  the number that the SharedCounter has been incremented to,
 *  the reducer to modify the SharedCounter by incrementing it
 * ]
 */
export function useSyncedCounter(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: number = 0,
): [number, ISyncedCounterReducer] {
    type viewState = ISyncedCounterViewState;
    type fluidState = ISyncedCounterFluidState;
    const [state, fluidReducer] = useSyncedCounterReducerFluid<
        viewState,
        fluidState
    >(
        syncedComponent,
        syncedStateId,
        "value",
        "counter",
        {
            value: defaultValue,
        },
    );
    const reducer: ISyncedCounterReducer = {
        increment: (step: number) =>
            fluidReducer.increment.function(state, step),
    };

    return [state.viewState.value, reducer];
}
