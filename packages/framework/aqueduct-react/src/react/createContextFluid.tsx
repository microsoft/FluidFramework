/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { FluidFunctionalComponentState, FluidContextProps, FluidContext } from "./interface";
import { useStateFluid } from "./useStateFluid";

export function createContextFluid<P,S extends FluidFunctionalComponentState,C>(props: FluidContextProps<P,S,C>):
FluidContext<S,C> {
    const [state, setState] = useStateFluid(props);
    const PrimedFluidContext = React.createContext({ state, setState, reactContext: props.reactContext });
    return {
        Provider: PrimedFluidContext.Provider,
        Consumer: PrimedFluidContext.Consumer,
        usePrimedContext: () => React.useContext(PrimedFluidContext),
        state,
        setState,
    };
}
