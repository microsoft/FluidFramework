/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedCounter } from "@fluidframework/counter";
import { useReducerFluid, } from "../..";
export function setFluidSyncedCounterConfig(syncedDataObject, syncedStateId, viewKey, fluidKey, defaultViewState, sharedObjectCreate = SharedCounter.create) {
    syncedDataObject.setFluidConfig(syncedStateId, {
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
                        viewState[viewKey] = fluidState[fluidKey].value;
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
                        viewState[viewKey] = fluidState[fluidKey].value;
                        return fluidState;
                    },
                },
            ],
        ]),
        defaultViewState,
    });
}
export function generateSyncedCounterReducer(viewKey, fluidKey) {
    const syncedCounterReducer = {
        increment: {
            function: (state, step) => {
                var _a;
                if (((_a = state === null || state === void 0 ? void 0 : state.fluidState) === null || _a === void 0 ? void 0 : _a[fluidKey]) === undefined) {
                    throw Error("State was not initialized prior to dispatch call");
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
export function useSyncedCounterReducerFluid(syncedDataObject, syncedStateId, viewKey, fluidKey, defaultViewState) {
    const syncedCounterReducer = generateSyncedCounterReducer(viewKey, fluidKey);
    return useReducerFluid({
        syncedDataObject,
        syncedStateId,
        reducer: syncedCounterReducer,
        selector: {},
    }, defaultViewState);
}
//# sourceMappingURL=fluidSyncedCounter.js.map