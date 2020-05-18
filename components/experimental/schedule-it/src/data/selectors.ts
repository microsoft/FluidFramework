/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    IPersonState,
    IPersonSelector,
} from "../interface";

export const PersonSelector: IPersonSelector = {
    getAvailabilityMap: {
        function: (state: IPersonState, dataProps, handle: IComponentHandle<SharedMap>) => {
            const personAvailabilityMap = dataProps.fluidComponentMap.get(handle)?.component;
            if (personAvailabilityMap !== undefined) {
                return personAvailabilityMap as SharedMap;
            }
        },
    },
};
