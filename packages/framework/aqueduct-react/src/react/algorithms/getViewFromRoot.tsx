/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    FluidComponentMap,
    IViewConverter,
} from "../interface";

export function getViewFromRoot<SV, SF>(
    root: ISharedDirectory,
    rootKey: keyof SF,
    fluidComponentMap: FluidComponentMap,
    fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>,
    combinedRootState?: Partial<SF>,
): Partial<SV> {
    const syncedState = root.get("syncedState");
    let value = syncedState[rootKey];
    if (combinedRootState) {
        value = combinedRootState[rootKey] || value;
    }
    const viewConverter = fluidToView && fluidToView.get(rootKey)?.viewConverter;
    if (viewConverter) {
        const partialRootState: Partial<SF> = {};
        partialRootState[rootKey] = value;
        return viewConverter(partialRootState, fluidComponentMap);
    } else {
        const partialViewState: Partial<SV> = {};
        const convertedValue = value.IComponentHandle ? fluidComponentMap.get((value as IComponentHandle)) : value;
        partialViewState[rootKey as string] = convertedValue;
        return partialViewState;
    }
}
