import { AsJsonable } from "@fluidframework/component-runtime-definitions";

import React, { useContext } from "react";

import { FluidContext, Widen } from "./FluidContext";

/**
 * react hook for getting and setting from a fluid map.
 * @param key - map key
 * @param initialValue - will set the map key value if it's undefined
 */
export function useFluidState<T>(key: string, initialValue: AsJsonable<T>):
[Widen<T>, React.Dispatch<React.SetStateAction<Widen<T>>>] {
    const context = useContext(FluidContext);
    return context.useState(key, initialValue);
}

export function useFluidReducer<T, U>(key: string, reducer: React.Reducer<Widen<T>, U>, initialState: AsJsonable<T>):
[Widen<T>, React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>] {
    const context = useContext(FluidContext);
    return context.useReducer(key, reducer, initialState);
}
