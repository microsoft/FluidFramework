/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import {
    IFluidFunctionalComponentViewState,
    IFluidReducerProps,
    IFluidDataProps,
    instanceOfStateUpdateFunction,
    instanceOfAsyncStateUpdateFunction,
    instanceOfSelectorFunction,
    instanceOfComponentSelectorFunction,
    instanceOfEffectFunction,
    instanceOfAsyncEffectFunction,
    IStateUpdateResult,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    IFluidSelector,
    ICombinedState,
} from "./interface";
import { useStateFluid } from "./useStateFluid";
import {
    updateStateAndComponentMap,
    rootCallbackListener,
    getFluidStateFromRoot,
    syncStateAndRoot,
} from "./helpers";

export function useReducerFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    A extends IFluidReducer<SV, SF, C>,
    B extends IFluidSelector<SV, SF, C>,
    C extends IFluidDataProps
>(
    props: IFluidReducerProps<SV, SF, A, B, C>,
    initialViewState: SV,
): [ICombinedState<SV, SF, C>, A, B] {
    const {
        syncedStateId,
        reducer,
        selector,
        root,
        viewToFluid,
        fluidToView,
        dataProps,
    } = props;
    // Get our combined synced state and setState callbacks from the useStateFluid function
    const [viewState, setState] = useStateFluid<SV, SF>({
        syncedStateId,
        root,
        dataProps,
        fluidToView,
        viewToFluid,
    }, initialViewState);

    // Dispatch is an in-memory object that will load the reducer actions provided by the user
    // and add updates to the state and root based off of the type of function and
    // state values that were updated. Think of it as prepping the data in the first
    // stage of dynamic programming. The dispatch functions are copies of the user-defined functions
    // but with the updates to synced state also handled
    const dispatch = React.useCallback(
        (
            dispatchState: ICombinedState<SV, SF, C>,
            type: keyof A,
            ...args: any
        ) => {
            // Retrieve the current state that is stored on the root for this component ID
            const currentFluidState = getFluidStateFromRoot(
                syncedStateId,
                root,
                dataProps.fluidComponentMap,
                fluidToView,
            );
            if (currentFluidState === undefined) {
                throw Error(
                    "Attempted to dispatch function before fluid state was initialized",
                );
            }
            const combinedDispatchFluidState: SF = {
                ...currentFluidState,
                ...dispatchState.fluidState,
            };
            const combinedDispatchViewState: SV = {
                ...viewState,
                ...dispatchState.viewState,
            };
            const combinedDispatchDataProps: C = {
                ...dataProps,
                ...dispatchState.dataProps,
            };
            const combinedDispatchState = {
                fluidState: combinedDispatchFluidState,
                viewState: combinedDispatchViewState,
                dataProps: combinedDispatchDataProps,
            };
            const action = reducer[type];
            if (action && instanceOfStateUpdateFunction<SV, SF, C>(action)) {
                // If its a synchronous state update function, call it and inspect the result for new component handles
                const result = (action.function as any)(
                    combinedDispatchState,
                    ...args,
                );
                if (result.newComponentHandles) {
                    // Fetch any new components and the listener to their root. Then update the state.
                    const callback = rootCallbackListener(
                        combinedDispatchDataProps.fluidComponentMap,
                        syncedStateId,
                        root,
                        combinedDispatchDataProps.runtime,
                        result.state.viewState,
                        setState,
                        fluidToView,
                        viewToFluid,
                    );
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    updateStateAndComponentMap(
                        result.newComponentHandles,
                        combinedDispatchDataProps.fluidComponentMap,
                        false,
                        syncedStateId,
                        root,
                        combinedDispatchDataProps.runtime,
                        result.state.viewState,
                        setState,
                        callback,
                        fluidToView,
                        viewToFluid,
                    );
                } else {
                    // Update the state directly
                    syncStateAndRoot(
                        false,
                        syncedStateId,
                        root,
                        combinedDispatchDataProps.runtime,
                        result.state.viewState,
                        setState,
                        combinedDispatchDataProps.fluidComponentMap,
                        fluidToView,
                        viewToFluid,
                    );
                }
            } else if (
                action &&
                instanceOfAsyncStateUpdateFunction<SV, SF, C>(action)
            ) {
                // In the case of an async function, the function promise is treated as a Thenable
                // and the returned result is inspected after the function has completed
                (action.asyncFunction as any)(
                    combinedDispatchState,
                    ...args,
                ).then((result: IStateUpdateResult<SV, SF, C>) => {
                    const callback = rootCallbackListener(
                        combinedDispatchDataProps.fluidComponentMap,
                        syncedStateId,
                        root,
                        combinedDispatchDataProps.runtime,
                        result.state.viewState,
                        setState,
                        fluidToView,
                        viewToFluid,
                    );
                    if (result.newComponentHandles) {
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        updateStateAndComponentMap(
                            result.newComponentHandles,
                            combinedDispatchDataProps.fluidComponentMap,
                            false,
                            syncedStateId,
                            root,
                            combinedDispatchDataProps.runtime,
                            result.state.viewState,
                            setState,
                            callback,
                            fluidToView,
                            viewToFluid,
                        );
                    } else {
                        syncStateAndRoot(
                            false,
                            syncedStateId,
                            root,
                            combinedDispatchDataProps.runtime,
                            result.state.viewState,
                            setState,
                            combinedDispatchDataProps.fluidComponentMap,
                            fluidToView,
                            viewToFluid,
                        );
                    }
                });
            } else if (
                action &&
                instanceOfAsyncEffectFunction<SV, SF, C>(action)
            ) {
                (action.asyncFunction as any)(
                    combinedDispatchState,
                    ...args,
                ).then(() =>
                    syncStateAndRoot(
                        false,
                        syncedStateId,
                        root,
                        combinedDispatchDataProps.runtime,
                        combinedDispatchState.viewState,
                        setState,
                        combinedDispatchDataProps.fluidComponentMap,
                        fluidToView,
                        viewToFluid,
                    ),
                );
            } else if (action && instanceOfEffectFunction<SV, SF, C>(action)) {
                (action.function as any)(combinedDispatchState, ...args);
                syncStateAndRoot(
                    false,
                    syncedStateId,
                    root,
                    combinedDispatchDataProps.runtime,
                    combinedDispatchState.viewState,
                    setState,
                    combinedDispatchDataProps.fluidComponentMap,
                    fluidToView,
                    viewToFluid,
                );
            } else {
                throw new Error(
                    `Action with key ${action} does not
                 exist in the reducers provided`,
                );
            }
        },
        [reducer, viewState, setState, dataProps],
    );

    // The combinedReducer is then created using the dispatch functions we created above.
    // This allows us to preserve the reducer interface while injecting Fluid-specific logic
    // into the updating of the state. This is the second phase of DP, using the earlier created
    // in-memory object to access the function the user is trying to use in constant time and then,
    // subsequently performing it, taking the updated state, and applying it both locally and remotely
    const combinedReducer = {};
    Object.entries(reducer).forEach(([functionName, functionItem], i) => {
        if ((functionItem as any).asyncFunction !== undefined) {
            combinedReducer[functionName] = {
                asyncFunction: (
                    dispatchState: ICombinedState<SV, SF, C>,
                    ...args: any
                ) => dispatch(dispatchState, functionName, ...args),
            };
        } else {
            combinedReducer[functionName] = {
                function: (
                    dispatchState: ICombinedState<SV, SF, C>,
                    ...args: any
                ) => dispatch(dispatchState, functionName, ...args),
            };
        }
    });

    // Fetch is an in-memory object similar to dispatch, but now made for selector actions.
    // Selectors are NOT used for updating the state but instead to be able to access
    // and add other Fluid components using the handle provided. If the handle provided is not available
    // in our component map, it will be dynamically updated and setState will be called again with the updated component
    // map available for use. Alternatively, if you would like to pre-load components before React is initialized,
    // you can do so and provide them in dataProps.
    // Fetch can also be used to retrieve data from these components as they will also be available as a parameter.
    const fetch = React.useCallback(
        (
            fetchState: ICombinedState<SV, SF, C>,
            type: keyof B,
            handle?: IComponentHandle,
        ) => {
            // Retrieve the current state that is stored on the root for this component ID
            const currentFluidState = getFluidStateFromRoot(
                syncedStateId,
                root,
                dataProps.fluidComponentMap,
                fluidToView,
            );
            if (currentFluidState === undefined) {
                throw Error(
                    "Attempted to dispatch function before fluid state was initialized",
                );
            }
            const combinedFetchFluidState: SF = {
                ...currentFluidState,
                ...fetchState.fluidState,
            };
            const combinedFetchViewState: SV = {
                ...viewState,
                ...fetchState.viewState,
            };
            const combinedFetchDataProps: C = {
                ...dataProps,
                ...fetchState.dataProps,
            };
            const combinedFetchState = {
                fluidState: combinedFetchFluidState,
                viewState: combinedFetchViewState,
                dataProps: combinedFetchDataProps,
            };
            const action = selector[type];
            if (action && instanceOfSelectorFunction<SV, SF, C>(action)) {
                // Add any new handles that were returned by the selector to our list
                // to be loaded to the fluid component map
                let newHandles: IComponentHandle[] = [];
                if (
                    handle &&
                    instanceOfComponentSelectorFunction<SV, SF, C>(action) &&
                    combinedFetchDataProps.fluidComponentMap.get(
                        handle.path,
                    ) === undefined
                ) {
                    newHandles.push(handle);
                }
                const actionResult = (action.function as any)(
                    combinedFetchState,
                    handle,
                );
                if (
                    actionResult !== undefined &&
                    actionResult.newComponentHandles !== undefined
                ) {
                    newHandles = newHandles.concat(
                        actionResult.newComponentHandles,
                    );
                }
                // If there are handles, start a call to update the component map and then call the set state
                // callback when it has finished to provide the updated map in the state
                if (newHandles.length > 0) {
                    const callback = rootCallbackListener(
                        combinedFetchDataProps.fluidComponentMap,
                        syncedStateId,
                        root,
                        combinedFetchDataProps.runtime,
                        combinedFetchState.viewState,
                        setState,
                        fluidToView,
                        viewToFluid,
                    );
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    updateStateAndComponentMap(
                        newHandles,
                        combinedFetchDataProps.fluidComponentMap,
                        true,
                        syncedStateId,
                        root,
                        combinedFetchDataProps.runtime,
                        combinedFetchState.viewState,
                        setState,
                        callback,
                        fluidToView,
                        viewToFluid,
                    );
                }
                // Always return the result immediately
                return actionResult;
            } else {
                throw new Error(
                    `Action with key ${action} does not
                 exist in the reducers provided`,
                );
            }
        },
        [selector, viewState, setState, dataProps],
    );

    // The combined selector is then similarly created with the Fluid-specific logic of adding any new components
    // to our component map interjected into the setState logic
    const combinedSelector = {};
    Object.entries(selector).forEach(([functionName, functionItem], i) => {
        combinedSelector[functionName] = {
            function: (
                fetchState: ICombinedState<SV, SF, C>,
                handle?: IComponentHandle,
            ) => fetch(fetchState, functionName, handle),
        };
    });

    // Retrieve the current state that is stored on the root for this component ID
    const fluidState = getFluidStateFromRoot(
        syncedStateId,
        root,
        dataProps.fluidComponentMap,
        fluidToView,
    );

    return [
        {
            viewState,
            fluidState,
            dataProps,
        },
        combinedReducer as A,
        combinedSelector as B,
    ];
}
