/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentLoadable } from "@fluidframework/component-core-interfaces";
import { ISharedMap } from "@fluidframework/map";
import {
    IRootConverter,
    instanceOfIComponentLoadable,
} from "../interface";

/**
 * Return a partial Fluid state containing the view state key identified converted into its
 * corresponding Fluid state value in the partial Fluid state returned
 * @param state - The current view state
 * @param stateKey - The view state key that needs to converted to its Fluid state
 * @param componentKeyMap - The components in the Fluid state as returned by the schema
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export function getRootFromView<SV, SF>(
    state: SV,
    stateKey: keyof SV,
    componentKeyMap: ISharedMap,
    viewToFluid?: Map<keyof SV, IRootConverter<SV,SF>>,
): Partial<SF> {
    const value = state[stateKey];
    const rootConverter = viewToFluid && viewToFluid.get(stateKey)?.rootConverter;
    const possibleHandle = componentKeyMap.get(stateKey as string || `stateKeyHandle-${stateKey}`);
    if (possibleHandle) {
        return possibleHandle;
    } else if (rootConverter) {
        const partialViewState: Partial<SV> = {};
        partialViewState[stateKey] = value;
        return rootConverter(partialViewState);
    } else {
        const partialRootState: Partial<SF> = {};
        let convertedValue: any = value;
        if (instanceOfIComponentLoadable(value)) {
            convertedValue = (value as IComponentLoadable).handle;
            componentKeyMap.set(`stateKeyHandle-${stateKey}`, convertedValue);
        }
        partialRootState[stateKey as string] = convertedValue;
        return partialRootState;
    }
}
