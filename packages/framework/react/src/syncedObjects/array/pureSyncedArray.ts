/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SyncedComponent } from "../..";
import { ISyncedArrayViewState, ISyncedArrayFluidState, IPureSyncedArrayReducer } from "./interface";
import { setSyncedArrayConfig, useSyncedArrayReducerFluid } from ".";

export function setPureSyncedArrayConfig<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: T[] = [],
) {
    setSyncedArrayConfig<ISyncedArrayViewState<T>, ISyncedArrayFluidState<T>>(
        syncedComponent,
        syncedStateId,
        "values",
        "values",
        { values: defaultValue },
    );
}

export function usePureSyncedArrayReducerFluid<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue = [] as T[],
): [T[], IPureSyncedArrayReducer<T>] {
    type viewState = ISyncedArrayViewState<T>;
    type fluidState = ISyncedArrayFluidState<T>;
    const [state, reducer] = useSyncedArrayReducerFluid<viewState, fluidState>(
        syncedComponent,
        syncedStateId,
        "values",
        "values",
        { values: defaultValue },
    );
    const pureReducer: IPureSyncedArrayReducer<T> = {
        add: (value: T) => reducer.add.function(state, value),
    };

    return [state.viewState.values, pureReducer];
}
