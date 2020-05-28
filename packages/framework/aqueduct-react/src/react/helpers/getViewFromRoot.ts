/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@fluidframework/map";
import { IComponent } from "@fluidframework/component-core-interfaces";
import {
    FluidComponentMap,
    IViewConverter,
} from "../interface";
import { getFluidStateFromRoot } from "./getFluidStateFromRoot";

/**
 * Return a partial view state containing the fluid state key identified converted into its
 * corresponding view state value in the partial view state returned
 * @param syncedStateId - Unique ID for this synced component's state
 * @param root - The shared directory this component shared state is stored on
 * @param rootKey - The key of the value within the Fluid state that we want converted
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param combinedRootState - Optional param containing the combined root state so far to fetch from, instead of getting
 * the current value on the root
 */
export function getViewFromRoot<SV, SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    rootKey: keyof SF,
    fluidComponentMap: FluidComponentMap,
    fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>,
    combinedRootState?: Partial<SF>,
): Partial<SV> {
    const syncedState = getFluidStateFromRoot(syncedStateId, root, fluidComponentMap, fluidToView);
    let value = syncedState[rootKey];
    if (combinedRootState) {
        value = (combinedRootState[rootKey] || value) as SF[keyof SF];
    }
    const viewConverter = fluidToView && fluidToView.get(rootKey)?.viewConverter;
    if (viewConverter) {
        const partialRootState: Partial<SF> = {};
        partialRootState[rootKey] = value;
        return viewConverter(partialRootState, fluidComponentMap);
    } else {
        const partialViewState: Partial<SV> = {};
        const valueAsIComponentHandle =  (value as IComponent).IComponentHandle;
        const convertedValue = valueAsIComponentHandle ? fluidComponentMap.get(valueAsIComponentHandle.path) : value;
        partialViewState[rootKey as string] = convertedValue;
        return partialViewState;
    }
}
