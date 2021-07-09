/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    IViewState,
    IFluidContextProps,
    FluidContext,
    IFluidState,
} from "./interface";
import { useStateFluid } from "./useStateFluid";

export function createContextFluid<
    SV extends IViewState,
    SF extends IFluidState,
    C
>(props: IFluidContextProps<SV, SF, C>, initialViewState: SV): FluidContext<SV, C> {
    const [state, setState] = useStateFluid(props, initialViewState);
    const PrimedFluidContext = React.createContext({
        state,
        setState,
        reactContext: props.reactContext ?? {},
    });
    return {
        Provider: PrimedFluidContext.Provider,
        Consumer: PrimedFluidContext.Consumer,
        usePrimedContext: () => React.useContext(PrimedFluidContext),
        state,
        setState,
    };
}
