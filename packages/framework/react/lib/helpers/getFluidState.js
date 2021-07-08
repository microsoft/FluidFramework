/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Return the Fluid state from the syncedState with all handles converted into Fluid objects
 * @param syncedStateId - Unique ID for the synced state of this view
 * @param syncedState - Shared map the synced state is stored on
 * @param fluidObjectMap - Map of Fluid handle paths to their respective Fluid objects
 * @param fluidToView - Map of the Fluid state keys contains the optional syncedState key parameter,
 * in case the Fluid value is stored in the syncedState under a different key
 */
export function getFluidState(syncedStateId, syncedState, fluidObjectMap, fluidToView) {
    var _a, _b, _c, _d;
    const fluidObjectStateHandle = syncedState.get(`syncedState-${syncedStateId}`);
    if (fluidObjectStateHandle === undefined) {
        return;
    }
    const fluidObjectState = (_a = fluidObjectMap.get(fluidObjectStateHandle.absolutePath)) === null || _a === void 0 ? void 0 : _a.fluidObject;
    if (fluidObjectState === undefined) {
        return;
    }
    const fluidState = {};
    for (const fluidKey of fluidObjectState.keys()) {
        const createCallback = (_b = fluidToView === null || fluidToView === void 0 ? void 0 : fluidToView.get(fluidKey)) === null || _b === void 0 ? void 0 : _b.sharedObjectCreate;
        let value = fluidObjectState.get(fluidKey);
        if (value !== undefined && createCallback !== undefined) {
            const possibleFluidObjectId = (_d = (_c = value) === null || _c === void 0 ? void 0 : _c.IFluidHandle) === null || _d === void 0 ? void 0 : _d.absolutePath;
            if (possibleFluidObjectId !== undefined) {
                value = (fluidObjectMap.get(possibleFluidObjectId));
                fluidState[fluidKey] = value === null || value === void 0 ? void 0 : value.fluidObject;
            }
            else {
                fluidState[fluidKey] = value;
            }
        }
        else {
            fluidState[fluidKey] = value;
        }
    }
    return fluidState;
}
//# sourceMappingURL=getFluidState.js.map