/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-floating-promises */

import * as React from "react";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    FluidFunctionalComponentState,
    FluidReducerProps,
    IFluidDataProps,
    instanceOfStateUpdateFunction,
    instanceOfAsyncStateUpdateFunction,
    instanceOfSelectorFunction,
} from "./interface";
import { useStateFluid } from "./useStateFluid";

export function useReducerFluid<S extends FluidFunctionalComponentState, A, B>(
    props: FluidReducerProps<S, A, B>,
): [S, (type: keyof A, ...args: any) => void, (type: keyof B, handle: IComponentHandle) => any] {
    const {
        handleMap,
        reducer,
        selector,
        root,
        runtime,
        stateToRoot,
        initialState,
    } = props;

    const handleMapDefined =  handleMap ?? new Map();

    const [state, setState] = useStateFluid<{},S>({
        root,
        initialState,
        stateToRoot,
        handleMap: handleMapDefined,
    });

    const combinedReducer = React.useCallback((type: keyof A, ...args: any) => {
        const action =  reducer[(type)];
        const dataProps: IFluidDataProps = { runtime, handleMap: handleMapDefined };
        if (action && instanceOfStateUpdateFunction(action)) {
            const result = (action.function as any)(state, dataProps, ...args);
            setState(result);
        } else if (action && instanceOfAsyncStateUpdateFunction(action)) {
            (action.function as any)(state, dataProps, ...args).then((result) => setState(result));
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [reducer, state, setState, runtime, handleMap]);

    const combinedSelector = React.useCallback((type: keyof B, handle: IComponentHandle) => {
        const action =  selector[(type)];
        const handleMapData = handleMap ?? new Map();
        const dataProps: IFluidDataProps = { runtime, handleMap: handleMapData };
        if (action && instanceOfSelectorFunction(action)) {
            if (handleMapData.get(handle) === undefined) {
                handle.get().then((component) => {
                    handleMapData.set(handle, component);
                    setState({ ...state, handleMap: handleMapData }, true);
                });
            }
            return (action.function as any)(state, dataProps, handle);
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [reducer, state, setState, runtime, handleMap]);

    return [state, combinedReducer, combinedSelector];
}
