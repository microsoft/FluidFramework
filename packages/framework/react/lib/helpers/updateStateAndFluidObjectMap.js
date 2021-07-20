/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { addFluidObject, asyncForEach } from "./utils";
import { syncState } from "./syncState";
/**
 * Add listeners too all the new handles passed in, store their respective Fluid objects
 * on the fluidObjectMap, and then update both the local and synced state
 * @param newHandleList - List of IFluidHandles for new Fluid objects that need to be added to the map
 * @param fluidObjectMap - A map of Fluid handle paths to their Fluid objects
 * @param isSyncedStateUpdate - Is the update from a local state update or from one triggered by the synced state
 * @param syncedStateId - Unique ID for this synced Fluid object's state
 * @param syncedState - The shared map this Fluid object's synced state is stored on
 * @param runtime - The data store runtime
 * @param viewState - The current view state
 * @param setState - Callback to update the react view state
 * @param syncedStateCallback - The callback that will be triggered when the synced state value for the Fluid objects
 * passed in changes
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export const updateStateAndFluidObjectMap = async (newHandleList, fluidObjectMap, storedHandleMap, isSyncedStateUpdate, syncedStateId, syncedState, runtime, viewState, setState, syncedStateCallback, fluidToView, viewToFluid) => asyncForEach(newHandleList, addFluidObject, fluidObjectMap, syncedStateCallback, () => syncState(true, syncedStateId, syncedState, runtime, viewState, setState, fluidObjectMap, fluidToView, viewToFluid), storedHandleMap).then(() => syncState(isSyncedStateUpdate, syncedStateId, syncedState, runtime, viewState, setState, fluidObjectMap, fluidToView, viewToFluid));
//# sourceMappingURL=updateStateAndFluidObjectMap.js.map