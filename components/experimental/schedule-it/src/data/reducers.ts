import { v4 as uuid } from "uuid";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { HandleMap } from "@microsoft/fluid-aqueduct-react";
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
            return state;
        },
    },
};

export const DateReducer: IDateReducer = {
    set: {
        function: (state: IDateState, dataProps, key: string, time: IDate) => {
            state.dateMap.set(key, time);
            return state;
        },
    },
};

export const PersonReducer: IPersonReducer = {
    updateName: {
        function: (state: IPersonState, dataProps, key: string, name: string) => {
            const person = state.personMap.get<IPerson>(key);
            person.name = name;
            state.personMap.set(key, person);
            return state;
        },
    },
    updateAvailability: {
        function: (state: IPersonState, dataProps, key: string, availability: IAvailability) => {
            const { dateKey, availabilityType } = availability;
            const person = state.personMap.get<IPerson>(key);
            const availabilityMap = dataProps.handleMap.get(person.availabilityMapHandle) as SharedMap;
            const availabilityItem = availabilityMap.get<IAvailability>(dateKey);
            availabilityItem.availabilityType = availabilityType;
            availabilityMap.set(dateKey, availabilityItem);
            return state;
        },
    },
    addPerson: {
        function: (state: IPersonState, dataProps: { runtime: IComponentRuntime, handleMap: HandleMap }) => {
            const newAvailabilityMap = SharedMap.create(dataProps.runtime);
            Object.entries(defaultDates).forEach(([key, date]) => {
                newAvailabilityMap.set(key, { dateKey: date.key, availabilityType: AvailabilityType.No });
            });
            const newPerson: IPerson = {
                key: uuid(),
                name: "",
                availabilityMapHandle: newAvailabilityMap.handle as IComponentHandle<SharedMap>,
            };
            dataProps.handleMap.set(newAvailabilityMap.handle, newAvailabilityMap);
            state.personMap.set(newPerson.key, newPerson);
            return state;
        },
    },
    removePerson: {
        function: (state: IPersonState, dataProps, key: string) => {
            if (state.personMap.get(key) !== undefined) {
                state.personMap.set(key, undefined);
            }
            return state;
        },
    },
};
