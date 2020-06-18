/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsJsonable } from "@fluidframework/component-runtime-definitions";

import React, { useContext } from "react";

import { FluidContext, Widen } from "./FluidContext";

/**
 * react hook for getting and setting state from a fluid map
 *
 * If this is used outside of the FluidContext it will simply revert to using
 * standard react useState
 *
 * @param key - entry key, this should be a unique id
 * @param initialValue - will set the map key value if it's undefined
 */
export function useFluidState<T>(key: string, initialValue: AsJsonable<T>):
[Widen<T>, React.Dispatch<React.SetStateAction<Widen<T>>>] {
    const context = useContext(FluidContext);
    return context.useState(key, initialValue);
}

/**
 * react hook for getting and setting state from a fluid map
 *
 * If this is used outside of the FluidContext it will simply revert to using
 * standard react useReducer
 *
 * @param key - entry key, this should be a unique id
 * @param reducer - function run to transform the state
 * @param initialValue - will set the map key value if it's undefined
 */
export function useFluidReducer<T, U>(key: string, reducer: React.Reducer<Widen<T>, U>, initialState: AsJsonable<T>):
[Widen<T>, React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>] {
    const context = useContext(FluidContext);
    return context.useReducer(key, reducer, initialState);
}
