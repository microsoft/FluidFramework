/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { FluidFunctionalComponentState, FluidProps } from "./interface";
import { useStateFluid } from "./useStateFluid";

export function createContextFluid<P,S extends FluidFunctionalComponentState>(props: FluidProps<P,S>):
[
    React.ProviderExoticComponent<React.ProviderProps<{ state: S; setState: (newState: S) => void; }>>,
    React.Consumer<{ state: S; setState: (newState: S) => void; }>,
    {state: S, setState: (newState: S) => void},
] {
    const [state, setState] = useStateFluid(props);
    const FluidContext = React.createContext({ state, setState });
    return [FluidContext.Provider, FluidContext.Consumer, { state, setState }];
}
