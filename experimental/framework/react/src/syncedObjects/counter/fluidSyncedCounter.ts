/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCounter } from "@fluidframework/counter";
import {
    IViewState,
    IFluidState,
    ICombinedState,
    IFluidDataProps,
    useReducerFluid,
    SyncedDataObject,
} from "../..";
import { IFluidSyncedCounterReducer } from "./interface";

export function setFluidSyncedCounterConfig<
    SV extends IViewState,
    SF extends IFluidState
>(
    syncedDataObject: SyncedDataObject,
    syncedStateId: string,
    viewKey: keyof SV,
    fluidKey: keyof SF,
    defaultViewState: SV,
    sharedObjectCreate = SharedCounter.create,
) {
    syncedDataObject.setFluidConfig<SV, SF>(syncedStateId, {
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
                    sharedObjectCreate,
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
    SV extends IViewState,
    SF extends IFluidState
>(viewKey: keyof SV, fluidKey: keyof SF): IFluidSyncedCounterReducer<SV, SF> {
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
    SV extends IViewState,
    SF extends IFluidState
>(
    syncedDataObject: SyncedDataObject,
    syncedStateId: string,
    viewKey: keyof SV,
    fluidKey: keyof SF,
    defaultViewState: SV,
// eslint-disable-next-line @typescript-eslint/ban-types
): [ICombinedState<SV, SF, IFluidDataProps>, IFluidSyncedCounterReducer<SV, SF>, {}] {
    const syncedCounterReducer = generateSyncedCounterReducer(viewKey, fluidKey);
    return useReducerFluid<
        SV,
        SF,
        IFluidSyncedCounterReducer<SV, SF>,
        // eslint-disable-next-line @typescript-eslint/ban-types
        {},
        IFluidDataProps
    >(
        {
            syncedDataObject,
            syncedStateId,
            reducer: syncedCounterReducer,
            selector: {},
        },
        defaultViewState,
    );
}
