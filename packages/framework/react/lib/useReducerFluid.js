/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";
import { instanceOfStateUpdateFunction, instanceOfAsyncStateUpdateFunction, instanceOfSelectorFunction, instanceOfFluidObjectSelectorFunction, instanceOfEffectFunction, instanceOfAsyncEffectFunction, } from "./interface";
import { useStateFluid } from "./useStateFluid";
import { updateStateAndFluidObjectMap, syncedStateCallbackListener, getFluidState, syncState, getSchema, } from "./helpers";
export function useReducerFluid(props, initialViewState) {
    var _a, _b;
    const { syncedStateId, reducer, selector, syncedDataObject, } = props;
    const config = syncedDataObject.getConfig(syncedStateId);
    if (config === undefined) {
        throw Error(`Failed to find configuration for synced state ID: ${syncedStateId}`);
    }
    const dataProps = (_a = props.dataProps) !== null && _a !== void 0 ? _a : syncedDataObject.dataProps;
    // Get our combined synced state and setState callbacks from the useStateFluid function
    const [viewState, setState] = useStateFluid({
        syncedStateId,
        syncedDataObject,
        dataProps,
    }, initialViewState);
    const syncedState = syncedDataObject.syncedState;
    const { fluidToView, viewToFluid } = config;
    const schemaHandles = getSchema(syncedStateId, syncedState);
    if ((schemaHandles === null || schemaHandles === void 0 ? void 0 : schemaHandles.storedHandleMapHandle.absolutePath) === undefined) {
        throw Error(`Component schema not initialized prior to render for ${syncedStateId}`);
    }
    const storedHandleMap = (_b = dataProps.fluidObjectMap.get(schemaHandles === null || schemaHandles === void 0 ? void 0 : schemaHandles.storedHandleMapHandle.absolutePath)) === null || _b === void 0 ? void 0 : _b.fluidObject;
    if (storedHandleMap === undefined) {
        throw Error(`Stored handle map not initialized prior to render for ${syncedStateId}`);
    }
    // Dispatch is an in-memory object that will load the reducer actions provided by the user
    // and add updates to the view and Fluid state based off of the type of function and
    // state values that were updated. Think of it as prepping the data in the first
    // stage of dynamic programming. The dispatch functions are copies of the user-defined functions
    // but with the updates to synced state also handled
    const dispatch = React.useCallback((type, dispatchState, ...args) => {
        // Retrieve the current state that is stored on the synced state for this Fluid object ID
        const currentFluidState = getFluidState(syncedStateId, syncedState, dataProps.fluidObjectMap, fluidToView);
        if (currentFluidState === undefined) {
            throw Error("Attempted to dispatch function before fluid state was initialized");
        }
        const combinedDispatchFluidState = Object.assign(Object.assign({}, currentFluidState), dispatchState === null || dispatchState === void 0 ? void 0 : dispatchState.fluidState);
        const combinedDispatchViewState = Object.assign(Object.assign({}, viewState), dispatchState === null || dispatchState === void 0 ? void 0 : dispatchState.viewState);
        const combinedDispatchDataProps = Object.assign(Object.assign({}, dataProps), dispatchState === null || dispatchState === void 0 ? void 0 : dispatchState.dataProps);
        const combinedDispatchState = {
            fluidState: combinedDispatchFluidState,
            viewState: combinedDispatchViewState,
            dataProps: combinedDispatchDataProps,
        };
        const action = reducer[type];
        if (action !== undefined) {
            if (instanceOfStateUpdateFunction(action)) {
                // If its a synchronous state update function, call it and inspect the result
                // for new Fluid object handles
                const result = action.function(combinedDispatchState, ...args);
                if (result.newComponentHandles !== undefined) {
                    // Fetch any new Fluid objects and add a listener to their synced state.
                    // Then update the view state.
                    const callback = syncedStateCallbackListener(combinedDispatchDataProps.fluidObjectMap, storedHandleMap, syncedStateId, syncedState, combinedDispatchDataProps.runtime, result.state.viewState, setState, fluidToView, viewToFluid);
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    updateStateAndFluidObjectMap(result.newComponentHandles, combinedDispatchDataProps.fluidObjectMap, storedHandleMap, false, syncedStateId, syncedState, combinedDispatchDataProps.runtime, result.state.viewState, setState, callback, fluidToView, viewToFluid);
                }
                else {
                    // Update the state directly
                    syncState(false, syncedStateId, syncedState, combinedDispatchDataProps.runtime, result.state.viewState, setState, combinedDispatchDataProps.fluidObjectMap, fluidToView, viewToFluid);
                }
            }
            else if (instanceOfAsyncStateUpdateFunction(action)) {
                // In the case of an async function, the function promise is treated as a Thenable
                // and the returned result is inspected after the function has completed
                action.asyncFunction(combinedDispatchState, ...args).then((result) => {
                    const callback = syncedStateCallbackListener(combinedDispatchDataProps.fluidObjectMap, storedHandleMap, syncedStateId, syncedState, combinedDispatchDataProps.runtime, result.state.viewState, setState, fluidToView, viewToFluid);
                    if (result.newFluidHandles !== undefined) {
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        updateStateAndFluidObjectMap(result.newFluidHandles, combinedDispatchDataProps.fluidObjectMap, storedHandleMap, false, syncedStateId, syncedState, combinedDispatchDataProps.runtime, result.state.viewState, setState, callback, fluidToView, viewToFluid);
                    }
                    else {
                        syncState(false, syncedStateId, syncedState, combinedDispatchDataProps.runtime, result.state.viewState, setState, combinedDispatchDataProps.fluidObjectMap, fluidToView, viewToFluid);
                    }
                });
            }
            else if (instanceOfAsyncEffectFunction(action)) {
                action.asyncFunction(combinedDispatchState, ...args).then(() => syncState(false, syncedStateId, syncedState, combinedDispatchDataProps.runtime, combinedDispatchState.viewState, setState, combinedDispatchDataProps.fluidObjectMap, fluidToView, viewToFluid));
            }
            else if (instanceOfEffectFunction(action)) {
                action.function(combinedDispatchState, ...args);
                syncState(false, syncedStateId, syncedState, combinedDispatchDataProps.runtime, combinedDispatchState.viewState, setState, combinedDispatchDataProps.fluidObjectMap, fluidToView, viewToFluid);
            }
            else {
                throw new Error(`Action with key ${action} does not match an expected reducer action interface`);
            }
        }
        else {
            throw new Error(`Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [reducer, viewState, setState, dataProps]);
    // The combinedReducer is then created using the dispatch functions we created above.
    // This allows us to preserve the reducer interface while injecting Fluid-specific logic
    // into the updating of the state. This is the second phase of DP, using the earlier created
    // in-memory object to access the function the user is trying to use in constant time and then,
    // subsequently performing it, taking the updated state, and applying it both locally and remotely
    const combinedReducer = {};
    Object.entries(reducer).forEach(([functionName, functionItem], i) => {
        if (functionItem.asyncFunction !== undefined) {
            combinedReducer[functionName] = {
                asyncFunction: (dispatchState, ...args) => dispatch(functionName, dispatchState, ...args),
            };
        }
        else {
            combinedReducer[functionName] = {
                function: (dispatchState, ...args) => dispatch(functionName, dispatchState, ...args),
            };
        }
    });
    // Fetch is an in-memory object similar to dispatch, but now made for selector actions.
    // Selectors are NOT used for updating the state but instead to be able to access
    // and add other Fluid Fluid objects using the handle provided. If the handle provided is not available
    // in our Fluid object map, it will be dynamically updated and setState will be called again
    // with the updated Fluid object map available for use.
    // Alternatively, if you would like to pre-load Fluid objects before React is initialized,
    // you can do so and provide them in dataProps.
    // Fetch can also be used to retrieve data from these Fluid objects as they will also be available as a parameter.
    const fetch = React.useCallback((type, fetchState, handle) => {
        // Retrieve the current state that is stored on the syncedState for this Fluid object ID
        const currentFluidState = getFluidState(syncedStateId, syncedState, dataProps.fluidObjectMap, fluidToView);
        if (currentFluidState === undefined) {
            throw Error("Attempted to dispatch function before fluid state was initialized");
        }
        const combinedFetchFluidState = Object.assign(Object.assign({}, currentFluidState), fetchState === null || fetchState === void 0 ? void 0 : fetchState.fluidState);
        const combinedFetchViewState = Object.assign(Object.assign({}, viewState), fetchState === null || fetchState === void 0 ? void 0 : fetchState.viewState);
        const combinedFetchDataProps = Object.assign(Object.assign({}, dataProps), fetchState === null || fetchState === void 0 ? void 0 : fetchState.dataProps);
        const combinedFetchState = {
            fluidState: combinedFetchFluidState,
            viewState: combinedFetchViewState,
            dataProps: combinedFetchDataProps,
        };
        const action = selector[type];
        if (action !== undefined) {
            if (instanceOfSelectorFunction(action)) {
                // Add any new handles that were returned by the selector to our list
                // to be loaded to the fluid Fluid object map
                let newHandles = [];
                if (handle !== undefined &&
                    instanceOfFluidObjectSelectorFunction(action) &&
                    combinedFetchDataProps.fluidObjectMap.get(handle.absolutePath) === undefined) {
                    newHandles.push(handle);
                }
                const actionResult = action.function(combinedFetchState, handle);
                if (actionResult !== undefined &&
                    actionResult.newComponentHandles !== undefined) {
                    newHandles = newHandles.concat(actionResult.newComponentHandles);
                }
                // If there are handles, start a call to update the Fluid object map and then call the set state
                // callback when it has finished to provide the updated map in the state
                if (newHandles.length > 0) {
                    const callback = syncedStateCallbackListener(combinedFetchDataProps.fluidObjectMap, storedHandleMap, syncedStateId, syncedState, combinedFetchDataProps.runtime, combinedFetchState.viewState, setState, fluidToView, viewToFluid);
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    updateStateAndFluidObjectMap(newHandles, combinedFetchDataProps.fluidObjectMap, storedHandleMap, true, syncedStateId, syncedState, combinedFetchDataProps.runtime, combinedFetchState.viewState, setState, callback, fluidToView, viewToFluid);
                }
                // Always return the result immediately
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return actionResult;
            }
            else {
                throw new Error(`Action with key ${action} does not match an expected selector action interface`);
            }
        }
        else {
            throw new Error(`Action with key ${action} does not
                 exist in the selectors provided`);
        }
    }, [selector, viewState, setState, dataProps]);
    // The combined selector is then similarly created with the Fluid-specific logic of adding any new Fluid objects
    // to our Fluid object map interjected into the setState logic
    const combinedSelector = {};
    Object.entries(selector).forEach(([functionName, functionItem], i) => {
        combinedSelector[functionName] = {
            function: (fetchState, handle) => fetch(functionName, fetchState, handle),
        };
    });
    // Retrieve the current state that is stored on the syncedState for this Fluid object ID
    const fluidState = getFluidState(syncedStateId, syncedState, dataProps.fluidObjectMap, fluidToView);
    return [
        {
            viewState,
            fluidState,
            dataProps,
        },
        combinedReducer,
        combinedSelector,
    ];
}
//# sourceMappingURL=useReducerFluid.js.map