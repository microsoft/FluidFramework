/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import {
    FluidComponentMap,
    IViewConverter,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISyncedState,
} from "../interface";
import { getFluidState } from "./getFluidState";

/**
 * Return a partial view state containing the fluid state key identified converted into its
 * corresponding view state value in the partial view state returned
 * @param syncedStateId - Unique ID for this synced component's state
 * @param syncedState - The shared map this component shared state is stored on
 * @param fluidKey - The key of the value within the Fluid state that we want converted
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param combinedFluidState - Optional param containing the combined Fluid state so far to fetch from
 */
export function getViewFromFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    syncedStateId: string,
    syncedState: ISyncedState,
    fluidKey: keyof SF,
    fluidComponentMap: FluidComponentMap,
    fluidToView: Map<keyof SF, IViewConverter<SV, SF>>,
    viewState: SV,
    combinedFluidState?: Partial<SF>,
): Partial<SV> {
    const componentState = getFluidState(
        syncedStateId,
        syncedState,
        fluidComponentMap,
        fluidToView,
    );
    if (componentState === undefined) {
        throw Error(
            "Attempted to fetch view from fluid state before it was initialized",
        );
    }
    let value = componentState[fluidKey];
    if (combinedFluidState) {
        value = (combinedFluidState[fluidKey] || value) as SF[keyof SF];
    }
    const viewConverter =
        fluidToView && fluidToView.get(fluidKey)?.viewConverter;
    if (viewConverter) {
        const partialFluidState: Partial<SF> = {};
        partialFluidState[fluidKey] = value;
        return viewConverter(viewState, partialFluidState, fluidComponentMap);
    } else {
        const partialViewState: Partial<SV> = {};
        const valueAsIComponentHandle = (value as IComponent).IComponentHandle;
        const convertedValue = valueAsIComponentHandle
            ? fluidComponentMap.get(valueAsIComponentHandle.absolutePath)
            : value;
        partialViewState[fluidKey as string] = convertedValue;
        return partialViewState;
    }
}
