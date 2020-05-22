/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
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
import { updateStateAndComponentMap, rootCallbackListener, getFluidStateFromRoot } from "./algorithms";

export function useReducerFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    A extends IFluidReducer<SV,SF,C>,
    B extends IFluidSelector<SV,C>,
    C extends IFluidDataProps,
>(
    props: IFluidReducerProps<SV, SF, A, B, C>,
): [ICombinedState<SV,SF,C>, A, B] {
    const {
        syncedStateId,
        reducer,
        selector,
        root,
        viewToFluid,
        fluidToView,
        initialViewState,
        initialFluidState,
        dataProps,
    } = props;
    const [state, setState] = useStateFluid<SV,SF>({
        syncedStateId,
        root,
        initialViewState,
        initialFluidState,
        dataProps,
        fluidToView,
        viewToFluid,
    });

    const currentFluidState = getFluidStateFromRoot(syncedStateId, root, fluidToView);
    // Dispatch is an in-memory object that will load the reducer actions provided by the user
    // and add updates to the state and root based off of the type of function and
    // state values that were updated. Think of it as prepping the data in the first
    // stage of dynamic programming. The dispatch functions are copies of the user-defined functions
    // but with the updates to synced state also handled
    const dispatch = React.useCallback((
        dispatchState: ICombinedState<SV,SF,C>,
        type: keyof A,
        ...args: any
    ) => {
        const combinedDispatchFluidState: SF = { ...currentFluidState, ...dispatchState.fluidState };
        const combinedDispatchViewState: SV = { ...state, ...dispatchState.viewState };
        const combinedDispatchDataProps: C = { ...dataProps, ...dispatchState.dataProps };
        const combinedDispatchState: ICombinedState<SV,SF,C> = {
            fluidState: combinedDispatchFluidState,
            viewState: combinedDispatchViewState,
            dataProps: combinedDispatchDataProps,
        };
        const action =  reducer[(type)];
        if (action && instanceOfStateUpdateFunction<SV,SF,C>(action)) {
            const result = (action.function as any)(
                combinedDispatchState,
                ...args,
            );
            if (result.newComponentHandles) {
                const callback = rootCallbackListener(
                    combinedDispatchDataProps.fluidComponentMap,
                    false,
                    syncedStateId,
                    root,
                    result.state,
                    setState,
                    viewToFluid,
                    fluidToView,
                );
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                updateStateAndComponentMap(
                    result.newComponentHandles,
                    combinedDispatchDataProps.fluidComponentMap,
                    false,
                    syncedStateId,
                    root,
                    result.state,
                    setState,
                    callback,
                    viewToFluid,
                    fluidToView,
                );
            } else {
                setState(result.state);
            }
        } else if (action && instanceOfAsyncStateUpdateFunction<SV,SF,C>(action)) {
            (action.function as any)(
                combinedDispatchState,
                ...args,
            ).then((result: IStateUpdateResult<SV>) => {
                const callback = rootCallbackListener(
                    combinedDispatchDataProps.fluidComponentMap,
                    true,
                    syncedStateId,
                    root,
                    result.state,
                    setState,
                    viewToFluid,
                    fluidToView,
                );
                if (result.newComponentHandles) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    updateStateAndComponentMap(
                        result.newComponentHandles,
                        combinedDispatchDataProps.fluidComponentMap,
                        false,
                        syncedStateId,
                        root,
                        result.state,
                        setState,
                        callback,
                        viewToFluid,
                        fluidToView,
                    );
                } else {
                    setState(result.state);
                }
            });
        } else if (action && instanceOfAsyncEffectFunction<SV,SF,C>(action)) {
            (action.function as any)(
                combinedDispatchState,
                ...args,
            ).then(() => setState(combinedDispatchViewState));
        } else if (action && instanceOfEffectFunction<SV,SF,C>(action)) {
            (action.function as any)(
                combinedDispatchState,
                ...args,
            );
            setState(combinedDispatchViewState);
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [reducer, state, setState, dataProps, currentFluidState]);

    // The combinedReducer is then created using the dispatch functions we created above.
    // This allows us to preserve the reducer interface while injecting Fluid-specific logic
    // into the updating of the state. This is the second phase of DP, using the earlier created
    // in-memory object to access the function the user is trying to use in constant time and then,
    // subsequently performing it, taking the updated state, and applying it both locally and remotely
    const combinedReducer = {};
    Object.entries(reducer).forEach(([functionName, functionItem], i) => {
        combinedReducer[functionName] = {
            function: (
                dispatchState: ICombinedState<SV,SF,C>,
                ...args: any
            ) => dispatch(
                dispatchState,
                functionName,
                ...args,
            ),
        };
    });

    // Fetch is an in-memory object similar to dispatch, but now made for selector actions.
    // Selectors are NOT used for updating the state but instead to be able to access
    // and add other Fluid components using the handle provided. If the handle provided is not available
    // in our component map, it will be dynamically updated and setState will be called again with the updated component
    // map available for use. Alternatively, if you would like to pre-load components before React is initialized,
    // you can do so and provide them in dataProps.
    // Fetch can also be used to retrieve data from these components as they will also be available as a parameter.
    const fetch = React.useCallback((fetchState: SV, type: keyof B,  fetchDataProps?: C, handle?: IComponentHandle) => {
        const combinedFetchState = { ...state, ...fetchState };
        const combinedFetchDataProps = { ...fetchDataProps, ...dataProps };
        const action =  selector[(type)];
        if (action && instanceOfSelectorFunction<SV,C>(action)) {
            if (handle && instanceOfComponentSelectorFunction<SV,C>(action)
                && combinedFetchDataProps.fluidComponentMap.get(handle) === undefined) {
                const callback = rootCallbackListener(
                    combinedFetchDataProps.fluidComponentMap,
                    true,
                    syncedStateId,
                    root,
                    combinedFetchState,
                    setState,
                    viewToFluid,
                    fluidToView,
                );
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                updateStateAndComponentMap(
                    [handle],
                    combinedFetchDataProps.fluidComponentMap,
                    false,
                    syncedStateId,
                    root,
                    combinedFetchState,
                    setState,
                    callback,
                    viewToFluid,
                    fluidToView,
                );
            }
            return (action.function as any)(combinedFetchState, combinedFetchDataProps, handle);
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [selector, state, setState, dataProps]);

    // The combined selector is then similarly created with the Fluid-specific logic of adding any new components
    // to our component map interjected into the setState logic
    const combinedSelector = {};
    Object.entries(selector).forEach(([functionName, functionItem], i) => {
        combinedSelector[functionName] = {
            function: (
                viewState: SV,
                callbackDataProps?: C,
                handle?: IComponentHandle,
            ) => fetch(viewState, functionName, callbackDataProps, handle),
        };
    });

    return [
        {
            viewState: state,
            fluidState: currentFluidState,
            dataProps,
        },
        combinedReducer as A,
        combinedSelector as B,
    ];
}
