/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedObjectSequence } from "@fluidframework/sequence";
import {
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    SyncedComponent,
    ICombinedState,
    IFluidDataProps,
    useReducerFluid,
} from "../..";
import { IFluidSyncedArrayReducer } from "./interface";

export function setFluidSyncedArrayConfig<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    viewKey: keyof SV,
    fluidKey: keyof SF,
    defaultViewState: SV,
    sharedObjectCreate = SharedObjectSequence.create,
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
                    sharedObjectCreate,
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

export function generateSyncedArrayReducer<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(viewKey: keyof SV, fluidKey: keyof SF): IFluidSyncedArrayReducer<SV, SF> {
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
): [ICombinedState<SV, SF, IFluidDataProps>, IFluidSyncedArrayReducer<SV, SF>, {}] {
    const syncedArrayReducer = generateSyncedArrayReducer(viewKey, fluidKey);
    return useReducerFluid<
        SV,
        SF,
        IFluidSyncedArrayReducer<SV, SF>,
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
}
