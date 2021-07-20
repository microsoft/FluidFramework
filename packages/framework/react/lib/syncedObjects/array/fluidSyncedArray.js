/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedObjectSequence } from "@fluidframework/sequence";
import { useReducerFluid, } from "../..";
export function setFluidSyncedArrayConfig(syncedDataObject, syncedStateId, viewKey, fluidKey, defaultViewState, sharedObjectCreate = SharedObjectSequence.create) {
    syncedDataObject.setFluidConfig(syncedStateId, {
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
                        viewState[viewKey] = fluidState[fluidKey].getItems(0);
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
                        viewState[viewKey] = fluidState[fluidKey].getItems(0);
                        return fluidState;
                    },
                },
            ],
        ]),
        defaultViewState,
    });
}
export function generateSyncedArrayReducer(viewKey, fluidKey) {
    const syncedArrayReducer = {
        add: {
            function: (state, value) => {
                var _a;
                if (((_a = state === null || state === void 0 ? void 0 : state.fluidState) === null || _a === void 0 ? void 0 : _a[fluidKey]) === undefined) {
                    throw Error("State was not initialized prior to dispatch call");
                }
                state.fluidState[fluidKey].insert(state.fluidState[fluidKey].getLength(), [Object.assign({}, value)]);
                state.viewState[viewKey] = state.fluidState[fluidKey].getItems(0);
                return { state };
            },
        },
    };
    return syncedArrayReducer;
}
export function useSyncedArrayReducerFluid(syncedDataObject, syncedStateId, viewKey, fluidKey, defaultViewState) {
    const syncedArrayReducer = generateSyncedArrayReducer(viewKey, fluidKey);
    return useReducerFluid({
        syncedDataObject,
        syncedStateId,
        reducer: syncedArrayReducer,
        selector: {},
    }, defaultViewState);
}
//# sourceMappingURL=fluidSyncedArray.js.map