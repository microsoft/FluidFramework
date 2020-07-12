/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedObjectSequence } from "@fluidframework/sequence";
import { SyncedComponent } from "../..";
import { ISyncedArrayViewState, ISyncedArrayFluidState, IPureSyncedArrayReducer } from "./interface";
import { setFluidSyncedArrayConfig, useSyncedArrayReducerFluid } from ".";

export function setSyncedArrayConfig<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: T[] = [],
    sharedObjectCreate = SharedObjectSequence.create,
) {
    setFluidSyncedArrayConfig<ISyncedArrayViewState<T>, ISyncedArrayFluidState<T>>(
        syncedComponent,
        syncedStateId,
        "values",
        "values",
        { values: defaultValue },
        sharedObjectCreate,
    );
}

export function useSyncedArray<T>(
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
