/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    IPersonSelector,
} from "../interface";

export const PersonSelector: IPersonSelector = {
    getAvailabilityMap: {
        function: (state, handle: IComponentHandle<SharedMap>) => {
            const personAvailabilityMap = state.dataProps.fluidComponentMap.get(handle.path)?.component;
            if (personAvailabilityMap !== undefined) {
                return personAvailabilityMap as SharedMap;
            }
        },
    },
};
