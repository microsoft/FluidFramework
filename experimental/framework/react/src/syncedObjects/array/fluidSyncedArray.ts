/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedObjectSequence } from "@fluidframework/sequence";
import {
    IViewState,
    IFluidState,
    SyncedDataObject,
    ICombinedState,
    IFluidDataProps,
    useReducerFluid,
} from "../..";
import { IFluidSyncedArrayReducer } from "./interface";

export function setFluidSyncedArrayConfig<
    SV extends IViewState,
    SF extends IFluidState
>(
    syncedDataObject: SyncedDataObject,
    syncedStateId: string,
    viewKey: keyof SV,
    fluidKey: keyof SF,
    defaultViewState: SV,
    sharedObjectCreate = SharedObjectSequence.create,
) {
    syncedDataObject.setFluidConfig<SV, SF>(syncedStateId, {
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
    SV extends IViewState,
    SF extends IFluidState
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
    SV extends IViewState,
    SF extends IFluidState
>(
    syncedDataObject: SyncedDataObject,
    syncedStateId: string,
    viewKey: keyof SV,
    fluidKey: keyof SF,
    defaultViewState: SV,
// eslint-disable-next-line @typescript-eslint/ban-types
): [ICombinedState<SV, SF, IFluidDataProps>, IFluidSyncedArrayReducer<SV, SF>, {}] {
    const syncedArrayReducer = generateSyncedArrayReducer(viewKey, fluidKey);
    return useReducerFluid<
        SV,
        SF,
        IFluidSyncedArrayReducer<SV, SF>,
        // eslint-disable-next-line @typescript-eslint/ban-types
        {},
        IFluidDataProps
    >(
        {
            syncedDataObject,
            syncedStateId,
            reducer: syncedArrayReducer,
            selector: {},
        },
        defaultViewState,
    );
}
