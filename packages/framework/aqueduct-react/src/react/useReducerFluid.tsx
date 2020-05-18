/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import {
    FluidFunctionalComponentState,
    FluidReducerProps,
    IFluidDataProps,
    instanceOfStateUpdateFunction,
    instanceOfAsyncStateUpdateFunction,
    instanceOfSelectorFunction,
    instanceOfComponentSelectorFunction,
    instanceOfEffectFunction,
    instanceOfAsyncEffectFunction,
    IStateUpdateResult,
} from "./interface";
import { useStateFluid } from "./useStateFluid";
import { updateStateAndComponentMap } from "./updateStateAndComponentMap";

export function useReducerFluid<S extends FluidFunctionalComponentState, A, B, C extends IFluidDataProps>(
    props: FluidReducerProps<S, A, B, C>,
): [S, (type: keyof A, ...args: any) => void, (type: keyof B, handle?: IComponentHandle) => any] {
    const {
        fluidComponentMap,
        reducer,
        selector,
        root,
        runtime,
        stateToRoot,
        initialState,
        dataProps,
    } = props;
    const [state, setState] = useStateFluid<{},S>({
        root,
        initialState,
        stateToRoot,
        fluidComponentMap,
    });

    const combinedReducer = React.useCallback((type: keyof A, ...args: any) => {
        const action =  reducer[(type)];
        const combinedDataProps = { ...dataProps, runtime, fluidComponentMap };
        if (action && instanceOfAsyncStateUpdateFunction<S,C>(action)) {
            (action.function as any)(state, combinedDataProps, ...args).then((result: IStateUpdateResult<S>) => {
                if (result.newComponentHandles) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    updateStateAndComponentMap(
                        result.newComponentHandles,
                        fluidComponentMap,
                        root,
                        result.state,
                        setState,
                        stateToRoot,
                    );
                } else {
                    setState(result.state);
                }
            });
        } else if (action && instanceOfStateUpdateFunction<S,C>(action)) {
            const result = (action.function as any)(state, combinedDataProps, ...args);
            if (result.newComponentHandles) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                updateStateAndComponentMap(
                    result.newComponentHandles,
                    fluidComponentMap,
                    root,
                    result.state,
                    setState,
                    stateToRoot,
                );
            } else {
                setState(result.state);
            }
        } else if (action && instanceOfAsyncEffectFunction<S,C>(action)) {
            (action.function as any)(state, combinedDataProps, ...args).then(() => setState(state));
        } else if (action && instanceOfEffectFunction<S,C>(action)) {
            (action.function as any)(state, combinedDataProps, ...args);
            setState(state);
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [reducer, state, setState, runtime, fluidComponentMap, dataProps]);

    const combinedSelector = React.useCallback((type: keyof B, handle?: IComponentHandle) => {
        const action =  selector[(type)];
        const fluidComponentMapData = fluidComponentMap ?? new Map();
        const combinedDataProps = { runtime, fluidComponentMap: fluidComponentMapData };
        if (action && instanceOfSelectorFunction<S,C,any>(action)) {
            if (handle && instanceOfComponentSelectorFunction<S,C,IComponentLoadable>(action)
                && fluidComponentMapData.get(handle) === undefined) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                updateStateAndComponentMap([handle], fluidComponentMapData, root, state, setState, stateToRoot);
            }
            return (action.function as any)(state, combinedDataProps, handle);
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [selector, state, setState, runtime, fluidComponentMap, dataProps]);

    return [state, combinedReducer, combinedSelector];
}
