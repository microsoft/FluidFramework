/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsJsonable, JsonablePrimitive } from "@fluidframework/component-runtime-definitions";

import React, { useContext } from "react";

/**
 * React Context object that is used to propagate our function through the React DOM
 */
export const FluidMapContext = React.createContext(
    function <T = JsonablePrimitive>(key: string, initialValue?: AsJsonable<T>)
        : [T, <T2 = JsonablePrimitive>(value: AsJsonable<T2>)=> void] {
        throw new Error("FluidMapContext must be initialized and cannot use the default value.");
    }
);

/**
 * React hook for getting and setting from a fluid map.
 * This must be initialized within the context of a fluid using FluidMapContext.
 * @param key - map key
 * @param initialValue - will set the map key value if it's undefined only.
 */
export function useFluidMap<T>(key: string, initialValue?: AsJsonable<T>) {
    const useFluidMap = useContext(FluidMapContext);
    return useFluidMap(key, initialValue);
}
