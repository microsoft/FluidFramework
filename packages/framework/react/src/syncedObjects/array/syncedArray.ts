/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
<<<<<<< HEAD

import { SharedObjectSequence } from "@fluidframework/sequence";
import {
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    SyncedComponent,
    ICombinedState,
    IFluidDataProps,
    useReducerFluid,
} from "../..";
import { ISyncedArrayReducer } from "./interface";

export function setSyncedArrayConfig<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    viewKey: keyof SV,
    fluidKey: keyof SF,
    defaultViewState: SV,
) {
    syncedComponent.setFluidConfig<SV, SF>(syncedStateId, {
        syncedStateId,
        fluidToView: new Map([
            [
                fluidKey,
                {
                    type: SharedObjectSequence.name,
                    viewKey,
                    viewConverter: (viewState, fluidState) => {
                        if (fluidState[fluidKey] === undefined) {
                            throw Error("Fluid state was not initialized");
                        }
                        viewState[viewKey] = (fluidState[
                            fluidKey
                        ] as any).getItems(0);
                        return viewState;
                    },
                    sharedObjectCreate: SharedObjectSequence.create,
                    listenedEvents: ["valueChanged"],
                },
            ],
        ]),
        viewToFluid: new Map([
            [
                viewKey,
                {
                    type: "array",
                    fluidKey,
                    fluidConverter: (viewState, fluidState) => {
                        if (fluidState[fluidKey] === undefined) {
                            throw Error("Fluid state was not initialized");
                        }
                        viewState[viewKey] = (fluidState[
                            fluidKey
                        ] as any).getItems(0);
                        return fluidState;
                    },
                },
            ],
        ]),
        defaultViewState,
    });
}

export function generateReducer<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(viewKey: keyof SV, fluidKey: keyof SF): ISyncedArrayReducer<SV, SF> {
    const syncedArrayReducer = {
        add: {
            function: (state, value: any) => {
                if (state?.fluidState?.[fluidKey] === undefined) {
                    throw Error(
                        "State was not initialized prior to dispatch call",
                    );
                }
                state.fluidState[fluidKey].insert(
                    state.fluidState[fluidKey].getLength(),
                    [{ ...value }],
                );
                state.viewState[viewKey] = state.fluidState[fluidKey].getItems(
                    0,
                );
                return { state };
            },
        },
    };
    return syncedArrayReducer;
}

export function useSyncedArrayReducerFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    viewKey: keyof SV,
    fluidKey: keyof SF,
    defaultViewState: SV,
): [ICombinedState<SV, SF, IFluidDataProps>, ISyncedArrayReducer<SV, SF>, {}] {
    const syncedArrayReducer = generateReducer(viewKey, fluidKey);
    return useReducerFluid<
        SV,
        SF,
        ISyncedArrayReducer<SV, SF>,
        {},
        IFluidDataProps
    >(
        {
            syncedComponent,
            syncedStateId,
            reducer: syncedArrayReducer,
            selector: {},
        },
        defaultViewState,
    );
=======
import { SharedObjectSequence } from "@fluidframework/sequence";
import { SyncedComponent } from "../..";
import { ISyncedArrayViewState, ISyncedArrayFluidState, ISyncedArrayReducer } from "./interface";
import { setFluidSyncedArrayConfig, useSyncedArrayReducerFluid } from "./fluidSyncedArray";

/**
 * Function to set the config for a synced array on a syncedComponent's SharedMap synced state. This
 * will initialize and provide a SharedObjectSequence<T> for the view to use through a T[] interface.
 * This SharedObjectSequence provided is automatically bound to the state update of the
 * functional view useSyncedArray is called in.
 * @param syncedComponent - The Fluid component on which the synced state config is being set
 * @param syncedStateId - The ID of the view state that this config schema is being set for
 * @param defaultValue - The default values in the view array prior to the SharedObjectSequence initializing
 * @param sharedObjectCreate - The creation function for the SharedObjectSequence. This can be set to
 * pre-increment the sequence with initial values.
 */
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

/**
 * Function to use the synced array state powered by a SharedObjectSequence<T> that has been prepared for this view
 * @param syncedComponent - The Fluid component that holds the synced state config for this view
 * @param syncedStateId - The ID of this view state
 * @returns [
 *  the array of T objects currently in the SharedObjectSequence,
 *  the reducer to modify values on the SharedObjectSequence
 * ]
 */
export function useSyncedArray<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue = [] as T[],
): [T[], ISyncedArrayReducer<T>] {
    type viewState = ISyncedArrayViewState<T>;
    type fluidState = ISyncedArrayFluidState<T>;
    const [state, reducer] = useSyncedArrayReducerFluid<viewState, fluidState>(
        syncedComponent,
        syncedStateId,
        "values",
        "values",
        { values: defaultValue },
    );
    const pureReducer: ISyncedArrayReducer<T> = {
        add: (value: T) => reducer.add.function(state, value),
    };

    return [state.viewState.values, pureReducer];
>>>>>>> 53f0e4a434353df720e33ce5f452a6b9b0b1d2e1
}
