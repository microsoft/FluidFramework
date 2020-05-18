/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IFluidDataProps } from "@microsoft/fluid-aqueduct-react";
import {
    IDate,
    IPerson,
    IAvailability,
    IDateState,
    IPersonState,
    ICommentReducer,
    ICommentState,
    IDateReducer,
    IPersonReducer,
    AvailabilityType,
} from "../interface";
import { defaultDates } from "./defaultData";

export const CommentReducer: ICommentReducer = {
    add: {
        function: (state: ICommentState, dataProps, newComment: string, name: string) => {
            state.comments.push({ message: newComment, name });
            return { state };
        },
    },
};

export const DateReducer: IDateReducer = {
    set: {
        function: (state: IDateState, dataProps, key: string, time: IDate) => {
            state.dateMap.set(key, time);
            return { state };
        },
    },
};

export const PersonReducer: IPersonReducer = {
    updateName: {
        function: (state: IPersonState, dataProps, key: string, name: string) => {
            const person = state.personMap.get<IPerson>(key);
            person.name = name;
            state.personMap.set(key, person);
            return { state };
        },
    },
    updateAvailability: {
        function: (state: IPersonState, dataProps, key: string, availability: IAvailability) => {
            const { dateKey, availabilityType } = availability;
            const person = state.personMap.get<IPerson>(key);
            const availabilityMap = (dataProps.fluidComponentMap
                .get(person.availabilityMapHandle)?.component) as SharedMap;
            const availabilityItem = availabilityMap.get<IAvailability>(dateKey);
            availabilityItem.availabilityType = availabilityType;
            availabilityMap.set(dateKey, availabilityItem);
            return { state };
        },
    },
    addPerson: {
        function: (state: IPersonState, dataProps: IFluidDataProps) => {
            const newAvailabilityMap = SharedMap.create(dataProps.runtime);
            Object.entries(defaultDates).forEach(([key, date]) => {
                newAvailabilityMap.set(key, { dateKey: date.key, availabilityType: AvailabilityType.No });
            });
            const newPerson: IPerson = {
                key: uuid(),
                name: "",
                availabilityMapHandle: newAvailabilityMap.handle as IComponentHandle<SharedMap>,
            };
            state.personMap.set(newPerson.key, newPerson);
            return { state, newComponentHandles: [newAvailabilityMap.handle] };
        },
    },
    removePerson: {
        function: (state: IPersonState, dataProps, key: string) => {
            if (state.personMap.get(key) !== undefined) {
                state.personMap.delete(key);
            }
            return { state };
        },
    },
};
