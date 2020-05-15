import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    IPersonState,
    IPersonSelector,
} from "../interface";

export const PersonSelector: IPersonSelector = {
    getAvailabilityMap: {
        function: (state: IPersonState, dataProps, handle: IComponentHandle<SharedMap>) => {
            const personAvailabilityMap = dataProps.handleMap.get(handle);
            if (personAvailabilityMap !== undefined) {
                return personAvailabilityMap as SharedMap;
            }
        },
    },
};
