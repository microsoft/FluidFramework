/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Return a partial Fluid state containing the view state key identified converted into its
 * corresponding Fluid state value in the partial Fluid state returned
 * @param state - The current view state
 * @param viewKey - The view state key that needs to converted to its Fluid state
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export function getFluidFromView(state, viewKey, fluidState, viewToFluid) {
    var _a;
    const fluidConverter = (_a = viewToFluid === null || viewToFluid === void 0 ? void 0 : viewToFluid.get(viewKey)) === null || _a === void 0 ? void 0 : _a.fluidConverter;
    if (fluidConverter !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return fluidConverter(state, fluidState);
    }
    else {
        const partialFluidState = {};
        partialFluidState[viewKey] = state[viewKey];
        return partialFluidState;
    }
}
//# sourceMappingURL=getFluidFromView.js.map