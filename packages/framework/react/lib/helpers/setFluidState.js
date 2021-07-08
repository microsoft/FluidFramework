/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedMap } from "@fluidframework/map";
/**
 * Store the Fluid state onto the shared synced state
 * @param syncedStateId - Unique ID to use for storing the Fluid object's synced state in the map
 * @param syncedState - The shared map that will be used to store the synced state
 * @param runtime - The data store runtime
 * @param fluidObjectMap - A map of Fluid handle paths to their Fluid objects
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param newFluidState - The Fluid state to store on to the syncedState,
 * after converting Fluid objects to their handles
 */
export function setFluidState(syncedStateId, syncedState, runtime, fluidObjectMap, fluidToView, newViewState, newFluidState, viewToFluid) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const storedStateHandle = syncedState.get(`syncedState-${syncedStateId}`);
    let storedState;
    if (storedStateHandle) {
        storedState = (_a = fluidObjectMap.get(storedStateHandle.absolutePath)) === null || _a === void 0 ? void 0 : _a.fluidObject;
    }
    if (storedStateHandle === undefined || storedState === undefined) {
        const newState = SharedMap.create(runtime);
        fluidObjectMap.set(newState.handle.absolutePath, {
            fluidObject: newState,
            isRuntimeMap: true,
        });
        storedState = newState;
    }
    if (storedState === undefined) {
        throw Error("Failed to fetch synced state from root");
    }
    for (const key of fluidToView.keys()) {
        const fluidKey = key;
        const syncedStateKey = (_b = fluidToView === null || fluidToView === void 0 ? void 0 : fluidToView.get(fluidKey)) === null || _b === void 0 ? void 0 : _b.rootKey;
        const createCallback = (_c = fluidToView === null || fluidToView === void 0 ? void 0 : fluidToView.get(fluidKey)) === null || _c === void 0 ? void 0 : _c.sharedObjectCreate;
        if (createCallback !== undefined) {
            if (storedState.get(fluidKey) === undefined) {
                const sharedObject = createCallback(runtime);
                fluidObjectMap.set(sharedObject.handle.absolutePath, {
                    fluidObject: sharedObject,
                    listenedEvents: (_e = (_d = fluidToView === null || fluidToView === void 0 ? void 0 : fluidToView.get(fluidKey)) === null || _d === void 0 ? void 0 : _d.listenedEvents) !== null && _e !== void 0 ? _e : ["valueChanged"],
                });
                storedState.set(fluidKey, sharedObject.handle);
                if (syncedStateKey !== undefined) {
                    syncedState.set(syncedStateKey, sharedObject.handle);
                }
            }
            else {
                storedState.set(fluidKey, storedState.get(fluidKey));
                if (syncedStateKey !== undefined) {
                    syncedState.set(syncedStateKey, syncedState.get(syncedStateKey));
                }
            }
        }
        else if (syncedStateKey !== undefined) {
            const value = newFluidState !== undefined
                ? newFluidState[fluidKey]
                : syncedState.get(syncedStateKey);
            syncedState.set(syncedStateKey, value);
            storedState.set(fluidKey, value);
        }
        else {
            const value = newFluidState !== undefined
                ? newFluidState[fluidKey]
                : storedState.get(fluidKey);
            storedState.set(fluidKey, value);
        }
    }
    if (viewToFluid !== undefined && newFluidState !== undefined) {
        for (const key of viewToFluid.keys()) {
            const viewKey = key;
            const fluidConverter = (_f = viewToFluid === null || viewToFluid === void 0 ? void 0 : viewToFluid.get(viewKey)) === null || _f === void 0 ? void 0 : _f.fluidConverter;
            const fluidKey = (_g = viewToFluid === null || viewToFluid === void 0 ? void 0 : viewToFluid.get(viewKey)) === null || _g === void 0 ? void 0 : _g.fluidKey;
            if (fluidConverter !== undefined && fluidKey !== undefined) {
                const value = fluidConverter(newViewState, newFluidState);
                // Write this value to the stored state if it doesn't match the name of a view value
                if (((_h = fluidToView.get(fluidKey)) === null || _h === void 0 ? void 0 : _h.sharedObjectCreate) ===
                    undefined) {
                    storedState.set(viewKey, value);
                }
            }
        }
    }
    syncedState.set(`syncedState-${syncedStateId}`, storedState.handle);
    return storedState.handle;
}
//# sourceMappingURL=setFluidState.js.map