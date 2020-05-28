/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    IFluidFunctionalComponentViewState,
    IFluidContextProps,
    FluidContext,
    IFluidFunctionalComponentFluidState,
} from "./interface";
import { useStateFluid } from "./useStateFluid";

export function createContextFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C,
>(props: IFluidContextProps<SV,SF,C>):
FluidContext<SV,C> {
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
