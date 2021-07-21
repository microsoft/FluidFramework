/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedObjectSequence } from "@fluidframework/sequence";
import { SyncedDataObject } from "../..";
import { ISyncedArrayViewState, ISyncedArrayFluidState, ISyncedArrayReducer } from "./interface";
import { setFluidSyncedArrayConfig, useSyncedArrayReducerFluid } from "./fluidSyncedArray";

/**
 * Function to set the config for a synced array on a syncedDataObject's SharedMap synced state. This
 * will initialize and provide a SharedObjectSequence<T> for the view to use through a T[] interface.
 * This SharedObjectSequence provided is automatically bound to the state update of the
 * functional view useSyncedArray is called in.
 * @param syncedDataObject - The Fluid data object on which the synced state config is being set
 * @param syncedStateId - The ID of the view state that this config schema is being set for
 * @param defaultValue - The default values in the view array prior to the SharedObjectSequence initializing
 * @param sharedObjectCreate - The creation function for the SharedObjectSequence. This can be set to
 * pre-increment the sequence with initial values.
 */
export function setSyncedArrayConfig<T>(
    syncedDataObject: SyncedDataObject,
    syncedStateId: string,
    defaultValue: T[] = [],
    sharedObjectCreate = SharedObjectSequence.create,
) {
    setFluidSyncedArrayConfig<ISyncedArrayViewState<T>, ISyncedArrayFluidState<T>>(
        syncedDataObject,
        syncedStateId,
        "values",
        "values",
        { values: defaultValue },
        sharedObjectCreate,
    );
}

/**
 * Function to use the synced array state powered by a SharedObjectSequence<T> that has been prepared for this view
 * @param syncedDataObject - The Fluid data object that holds the synced state config for this view
 * @param syncedStateId - The ID of this view state
 * @returns [
 *  the array of T objects currently in the SharedObjectSequence,
 *  the reducer to modify values on the SharedObjectSequence
 * ]
 */
export function useSyncedArray<T>(
    syncedDataObject: SyncedDataObject,
    syncedStateId: string,
    defaultValue = [] as T[],
): [T[], ISyncedArrayReducer<T>] {
    type viewState = ISyncedArrayViewState<T>;
    type fluidState = ISyncedArrayFluidState<T>;
    const [state, reducer] = useSyncedArrayReducerFluid<viewState, fluidState>(
        syncedDataObject,
        syncedStateId,
        "values",
        "values",
        { values: defaultValue },
    );
    const pureReducer: ISyncedArrayReducer<T> = {
        add: (value: T) => reducer.add.function(state, value),
    };

    return [state.viewState.values, pureReducer];
}
