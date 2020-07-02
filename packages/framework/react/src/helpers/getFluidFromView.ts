/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidConverter,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
} from "../interface";

/**
 * Return a partial Fluid state containing the view state key identified converted into its
 * corresponding Fluid state value in the partial Fluid state returned
 * @param state - The current view state
 * @param viewKey - The view state key that needs to converted to its Fluid state
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export function getFluidFromView<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    state: SV,
    viewKey: keyof SV,
    fluidState: SF,
    viewToFluid?: Map<keyof SV, IFluidConverter<SV, SF>>,
): Partial<SF> {
    const fluidConverter =
        viewToFluid && viewToFluid.get(viewKey)?.fluidConverter;
    if (fluidConverter) {
        return fluidConverter(state, fluidState);
    } else {
        const partialFluidState: Partial<SF> = {};
        partialFluidState[viewKey as string] = state[viewKey];
        return partialFluidState;
    }
}
