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
}
