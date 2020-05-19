/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidFunctionalComponentViewState,
    FluidReducerProps,
    IFluidDataProps,
    instanceOfStateUpdateFunction,
    instanceOfAsyncStateUpdateFunction,
    instanceOfSelectorFunction,
    instanceOfComponentSelectorFunction,
    instanceOfEffectFunction,
    instanceOfAsyncEffectFunction,
    IStateUpdateResult,
    IFluidFunctionalComponentFluidState,
} from "./interface";
import { useStateFluid } from "./useStateFluid";
import { updateStateAndComponentMap, rootCallbackListener } from "./updateStateAndComponentMap";

export function useReducerFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    A,
    B,
    C extends IFluidDataProps,
>(
    props: FluidReducerProps<SV, SF, A, B, C>,
): [SV, (type: keyof A, ...args: any) => void, (type: keyof B, handle?: IComponentHandle) => any] {
    const {
        fluidComponentMap,
        reducer,
        selector,
        root,
        runtime,
        viewToFluid,
        fluidToView,
        initialViewState,
        initialFluidState,
        dataProps,
    } = props;
    const [state, setState] = useStateFluid<SV,SF>({
        root,
        initialViewState,
        initialFluidState,
        fluidComponentMap,
        fluidToView,
        viewToFluid,
    });

    const combinedReducer = React.useCallback((type: keyof A, ...args: any) => {
        const action =  reducer[(type)];
        const combinedDataProps = { ...dataProps, runtime, fluidComponentMap };
        if (action && instanceOfAsyncStateUpdateFunction<SV,C>(action)) {
            (action.function as any)(state, combinedDataProps, ...args).then((result: IStateUpdateResult<SV>) => {
                const callback = rootCallbackListener(
                    fluidComponentMap,
                    true,
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
                        fluidComponentMap,
                        false,
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
        } else if (action && instanceOfStateUpdateFunction<SV,C>(action)) {
            const result = (action.function as any)(state, combinedDataProps, ...args);
            if (result.newComponentHandles) {
                const callback = rootCallbackListener(
                    fluidComponentMap,
                    false,
                    root,
                    result.state,
                    setState,
                    viewToFluid,
                    fluidToView,
                );
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                updateStateAndComponentMap(
                    result.newComponentHandles,
                    fluidComponentMap,
                    false,
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
        } else if (action && instanceOfAsyncEffectFunction<SV,C>(action)) {
            (action.function as any)(state, combinedDataProps, ...args).then(() => setState(state));
        } else if (action && instanceOfEffectFunction<SV,C>(action)) {
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
        const combinedDataProps = { runtime, fluidComponentMap };
        if (action && instanceOfSelectorFunction<SV,C,any>(action)) {
            if (handle && instanceOfComponentSelectorFunction<SV,C,IComponentLoadable>(action)
                && fluidComponentMap.get(handle) === undefined) {
                const callback = rootCallbackListener(
                    fluidComponentMap,
                    true,
                    root,
                    state,
                    setState,
                    viewToFluid,
                    fluidToView,
                );
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                updateStateAndComponentMap(
                    [handle],
                    fluidComponentMap,
                    false,
                    root,
                    state,
                    setState,
                    callback,
                    viewToFluid,
                    fluidToView,
                );
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
