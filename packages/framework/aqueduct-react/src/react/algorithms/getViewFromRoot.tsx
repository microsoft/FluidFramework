/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    FluidComponentMap,
    IViewConverter,
} from "../interface";
import { getFluidStateFromRoot } from "./getFluidStateFromRoot";

export function getViewFromRoot<SV, SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    rootKey: keyof SF,
    fluidComponentMap: FluidComponentMap,
    fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>,
    combinedRootState?: Partial<SF>,
): Partial<SV> {
    const syncedState = getFluidStateFromRoot(syncedStateId, root, fluidToView);
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
        const convertedValue = valueAsIComponentHandle ? fluidComponentMap.get(valueAsIComponentHandle) : value;
        partialViewState[rootKey as string] = convertedValue;
        return partialViewState;
    }
}
