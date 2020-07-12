/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedCounter } from "@fluidframework/counter";
import { SyncedComponent } from "../..";
import { ISyncedCounterViewState, ISyncedCounterFluidState, IPureSyncedCounterReducer } from "./interface";
import { setFluidSyncedCounterConfig, useSyncedCounterReducerFluid } from ".";

export function setSyncedCounterConfig(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: number = 0,
    sharedObjectCreate = SharedCounter.create,
) {
    setFluidSyncedCounterConfig<ISyncedCounterViewState, ISyncedCounterFluidState>(
        syncedComponent,
        syncedStateId,
        "value",
        "counter",
        { value: defaultValue },
        sharedObjectCreate,
    );
}

export function useSyncedCounter(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: number = 0,
): [number, IPureSyncedCounterReducer] {
    type viewState = ISyncedCounterViewState;
    type fluidState = ISyncedCounterFluidState;
    const [state, reducer] = useSyncedCounterReducerFluid<viewState, fluidState>(
        syncedComponent,
        syncedStateId,
        "value",
        "counter",
        { value: defaultValue },
    );
    const pureReducer: IPureSyncedCounterReducer = {
        increment: (step: number) => reducer.increment.function(state, step),
    };

    return [state.viewState.value, pureReducer];
}
