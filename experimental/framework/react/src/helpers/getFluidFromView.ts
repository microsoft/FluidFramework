/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidConverter,
    IViewState,
    IFluidState,
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
    SV extends IViewState,
    SF extends IFluidState
>(
    state: SV,
    viewKey: keyof SV,
    fluidState: SF,
    viewToFluid?: Map<keyof SV, IFluidConverter<SV, SF>>,
): Partial<SF> {
    const fluidConverter = viewToFluid?.get(viewKey)?.fluidConverter;
    if (fluidConverter !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return fluidConverter(state, fluidState);
    } else {
        const partialFluidState: Partial<SF> = {};
        partialFluidState[viewKey as string] = state[viewKey];
        return partialFluidState;
    }
}
