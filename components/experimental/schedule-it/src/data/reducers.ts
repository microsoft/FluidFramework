/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    IDate,
    IPerson,
    IAvailability,
    ICommentReducer,
    IDateReducer,
    IPersonReducer,
    AvailabilityType,
} from "../interface";
import { defaultDates } from "./defaultData";

export const CommentReducer: ICommentReducer = {
    add: {
        function: (state, newComment: string, name: string) => {
            state.viewState.comments.push({ message: newComment, name });
            return { state };
        },
    },
};

export const DateReducer: IDateReducer = {
    set: {
        function: (state, key: string, time: IDate) => {
            state.viewState.dateMap.set(key, time);
            return { state };
        },
    },
};

export const PersonReducer: IPersonReducer = {
    updateName: {
        function: (state, key: string, name: string) => {
            const person = state.viewState.personMap.get<IPerson>(key);
            person.name = name;
            state.viewState.personMap.set(key, person);
            return { state };
        },
    },
    updateAvailability: {
        function: (state, key: string, availability: IAvailability) => {
            const { dateKey, availabilityType } = availability;
            const person = state.viewState.personMap.get<IPerson>(key);
            const availabilityMap = (state.dataProps.fluidComponentMap
                .get(person.availabilityMapHandle.path)?.component) as SharedMap;
            const availabilityItem = availabilityMap.get<IAvailability>(dateKey);
            availabilityItem.availabilityType = availabilityType;
            availabilityMap.set(dateKey, availabilityItem);
            return { state };
        },
    },
    addPerson: {
        function: (state) => {
            const newAvailabilityMap = SharedMap.create(state.dataProps.runtime);
            Object.entries(defaultDates).forEach(([key, date]) => {
                newAvailabilityMap.set(key, { dateKey: date.key, availabilityType: AvailabilityType.No });
            });
            const newPerson: IPerson = {
                key: uuid(),
                name: "",
                availabilityMapHandle: newAvailabilityMap.handle as IComponentHandle<SharedMap>,
            };
            state.viewState.personMap.set(newPerson.key, newPerson);
            return { state, newComponentHandles: [newAvailabilityMap.handle] };
        },
    },
    removePerson: {
        function: (state, key: string) => {
            if (state.viewState.personMap.get(key) !== undefined) {
                state.viewState.personMap.delete(key);
            }
            return { state };
        },
    },
};
