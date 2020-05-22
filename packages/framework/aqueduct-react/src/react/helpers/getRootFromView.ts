/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import {
    IRootConverter,
    instanceOfIComponentLoadable,
} from "../interface";

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
