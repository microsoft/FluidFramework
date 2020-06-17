import { AsJsonable } from "@fluidframework/component-runtime-definitions";

import React, { useContext, useState, useReducer } from "react";

export type Widen<T> = T extends number ? number :
    T extends string ? string :
    T;

const DefaultFluidContext = {
    useMap<T>(key: string, initialValue: AsJsonable<T>)
    : [Widen<T>, React.Dispatch<React.SetStateAction<Widen<T>>>] {
        return useState<Widen<T>>(initialValue as unknown as Widen<T>);
    },
    useReducer<T, U>(key: string, reducer: React.Reducer<Widen<T>, U>, initialState: AsJsonable<T>)
    : [Widen<T>, React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>] {
        return useReducer(reducer, initialState as unknown as Widen<T>);
    }
}

/**
 * This context will enable developers to easily get a function
 * with an initialize fluid map.
 *
 * The default behavior is simply to use reacts useState.
 */
export const FluidContext = React.createContext(DefaultFluidContext);

/**
 * react hook for getting and setting from a fluid map.
 * @param key - map key
 * @param initialValue - will set the map key value if it's undefined
 */
export function useFluidState<T>(key: string, initialValue: AsJsonable<T>)
: [Widen<T>, React.Dispatch<React.SetStateAction<Widen<T>>>] {
    const context = useContext(FluidContext);
    return context.useMap(key, initialValue);
}

export function useFluidReducer<T, U>(key: string, reducer: React.Reducer<Widen<T>, U>, initialState: AsJsonable<T>)
: [Widen<T>, React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>] {
    const context = useContext(FluidContext);
    return context.useReducer(key, reducer, initialState);
}
