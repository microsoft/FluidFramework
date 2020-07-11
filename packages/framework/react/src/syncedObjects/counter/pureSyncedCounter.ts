/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SyncedComponent } from "../..";
import { ISyncedCounterViewState, ISyncedCounterFluidState, IPureSyncedCounterReducer } from "./interface";
import { setSyncedCounterConfig, useSyncedCounterReducerFluid } from ".";

export function setPureSyncedCounterConfig<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: number = 0,
) {
    setSyncedCounterConfig<ISyncedCounterViewState, ISyncedCounterFluidState>(
        syncedComponent,
        syncedStateId,
        "value",
        "counter",
        { value: defaultValue },
    );
}

export function usePureSyncedCounterReducerFluid(
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
