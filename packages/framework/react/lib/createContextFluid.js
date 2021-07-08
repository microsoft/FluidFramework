/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";
import { useStateFluid } from "./useStateFluid";
export function createContextFluid(props, initialViewState) {
    var _a;
    const [state, setState] = useStateFluid(props, initialViewState);
    const PrimedFluidContext = React.createContext({
        state,
        setState,
        reactContext: (_a = props.reactContext) !== null && _a !== void 0 ? _a : {},
    });
    return {
        Provider: PrimedFluidContext.Provider,
        Consumer: PrimedFluidContext.Consumer,
        usePrimedContext: () => React.useContext(PrimedFluidContext),
        state,
        setState,
    };
}
//# sourceMappingURL=createContextFluid.js.map