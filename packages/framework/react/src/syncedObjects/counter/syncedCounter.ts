/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCounter } from "@fluidframework/counter";
import {
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    SyncedComponent,
    ICombinedState,
    IFluidDataProps,
    useReducerFluid,
} from "../..";
import { ISyncedCounterReducer } from "./interface";

export function setSyncedCounterConfig<
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
                    type: SharedCounter.name,
                    viewKey,
                    viewConverter: (viewState, fluidState) => {
                        if (fluidState[fluidKey] === undefined) {
                            throw Error("Fluid state was not initialized");
                        }
                        viewState[viewKey] = (fluidState[
                            fluidKey
                        ] as any).value;
                        return viewState;
                    },
                    sharedObjectCreate: SharedCounter.create,
                    listenedEvents: ["incremented"],
                },
            ],
        ]),
        viewToFluid: new Map([
            [
                viewKey,
                {
                    type: "number",
                    fluidKey,
                    fluidConverter: (viewState, fluidState) => {
                        if (fluidState[fluidKey] === undefined) {
                            throw Error("Fluid state was not initialized");
                        }
                        viewState[viewKey] = (fluidState[
                            fluidKey
                        ] as any).value;
                        return fluidState;
                    },
                },
            ],
        ]),
        defaultViewState,
    });
}

export function generateSyncedCounterReducer<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(viewKey: keyof SV, fluidKey: keyof SF): ISyncedCounterReducer<SV, SF> {
    const syncedCounterReducer = {
        increment: {
            function: (state, step: number) => {
                if (state?.fluidState?.[fluidKey] === undefined) {
                    throw Error(
                        "State was not initialized prior to dispatch call",
                    );
                }
                const counter = state.fluidState[fluidKey];
                counter.increment(step);
                state.viewState[viewKey] = counter.value;
                return { state };
            },
        },
    };
    return syncedCounterReducer;
}

export function useSyncedCounterReducerFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    viewKey: keyof SV,
    fluidKey: keyof SF,
    defaultViewState: SV,
): [ICombinedState<SV, SF, IFluidDataProps>, ISyncedCounterReducer<SV, SF>, {}] {
    const syncedCounterReducer = generateSyncedCounterReducer(viewKey, fluidKey);
    return useReducerFluid<
        SV,
        SF,
        ISyncedCounterReducer<SV, SF>,
        {},
        IFluidDataProps
    >(
        {
            syncedComponent,
            syncedStateId,
            reducer: syncedCounterReducer,
            selector: {},
        },
        defaultViewState,
    );
}
