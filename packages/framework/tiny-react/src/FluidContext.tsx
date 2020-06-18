/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsJsonable } from "@fluidframework/component-runtime-definitions";
import { IDirectoryValueChanged, ISharedDirectory } from "@fluidframework/map";

import React, { useEffect, useReducer, useState } from "react";

export type Widen<T> = T extends number ? number :
    T extends string ? string :
    T;

export const generateUseFluidState = (map: ISharedDirectory) => {
    return function <T>(key: string, initialValue: AsJsonable<T>):
    [Widen<T>, React.Dispatch<React.SetStateAction<Widen<T>>>] {
        const currentValue: Widen<T> = (map.get(key) ?? initialValue) as T as Widen<T>;
        const [state, setState] = useState(currentValue);

        useEffect(() => {
            const onValueChanged = (changed: IDirectoryValueChanged) => {
                if (changed.key === key) {
                    setState(map.get(key));
                }
            };
            map.on("valueChanged", onValueChanged);
            return () => {
                map.off("valueChanged", onValueChanged);
            };
        }, [state]);

        const setNewState: React.Dispatch<React.SetStateAction<Widen<T>>> =
            (value) => map.set(key, value);

        return [state, setNewState];
    };
};

export const generateUseFluidReducer = (map: ISharedDirectory) => {
    return function <T, U>(key: string, reducer: React.Reducer<Widen<T>, U>, initialState: AsJsonable<T>):
    [Widen<T>, React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>] {
        const currentState: Widen<T> = (map.get(key) ?? initialState) as T as Widen<T>;
        const [state, setState] = useState(currentState);
        const dispatch: React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>
            = (action: any) => {
                const result = reducer(state, action);
                map.set(key, result);
            };

        useEffect(() => {
            const onValueChanged = (changed: IDirectoryValueChanged, local: boolean) => {
                if (changed.key === key) {
                    setState(map.get(key));
                }
            };
            map.on("valueChanged", onValueChanged);
            return () => {
                map.off("valueChanged", onValueChanged);
            };
        }, [state]);

        return [state, dispatch];
    };
};

const DefaultFluidContext = {
    useReducer: <T, U>(key: string, reducer: React.Reducer<Widen<T>, U>, initialState: AsJsonable<T>):
    [Widen<T>, React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>] =>
        useReducer(reducer, initialState as unknown as Widen<T>),
    useState: <T,>(key: string, initialValue: AsJsonable<T>):
    [Widen<T>, React.Dispatch<React.SetStateAction<Widen<T>>>] =>
        useState<Widen<T>>(initialValue as unknown as Widen<T>),
};

/**
 * This context will enable developers to easily get a function
 * with an initialize fluid map.
 *
 * The default behavior is simply to use reacts useState.
 */
export const FluidContext = React.createContext(DefaultFluidContext);
