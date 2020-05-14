import { v4 as uuid } from "uuid";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    IDate,
    IPerson,
    AvailabilityType,
    IAvailability,
    IDateState,
    IPersonState,
    ICommentReducer,
    ICommentState,
    IDateReducer,
    IPersonReducer,
    IDefaultPersonMap,
    IDefaultDateMap,
    IComment,
} from "./interface";

const today = new Date();
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);

export const defaultComments: IComment[] = [];

export const defaultDates: IDefaultDateMap = {
    today: {
        key: "today",
        date: today,
    },
    tomorrow: {
        key: "tomorrow",
        date: tomorrow,
    },
    dayAfter: {
        key: "dayAfter",
        date: dayAfter,
    },
};

export const defaultPeople: IDefaultPersonMap = {
    1: {
        key: "1",
        name: "Bruno",
        availabilityMap: {
            today: { dateKey: "today", availabilityType: AvailabilityType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.Maybe },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.Maybe },
        },
    },
    2: {
        key: "2",
        name: "Tamine",
        availabilityMap: {
            today: { dateKey: "today", availabilityType: AvailabilityType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.Yes },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.No },
        },
    },
    3: {
        key: "3",
        name: "Jodom",
        availabilityMap: {
            today: { dateKey: "today",  availabilityType: AvailabilityType.Maybe },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.No },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.Yes },
        },
    },
    4: {
        key: "4",
        name: "Michelle",
        availabilityMap: {
            today: { dateKey: "today", availabilityType: AvailabilityType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.No },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.Maybe },
        },
    },
};

export const CommentReducer: ICommentReducer = {
    add: {
        function: (state: ICommentState, runtime: IComponentRuntime, newComment: string, name: string) => {
            state.comments.push({ message: newComment, name });
            return state;
        },
    },
};

export const DateReducer: IDateReducer = {
    set: {
        function: (state: IDateState, runtime: IComponentRuntime, key: string, time: IDate) => {
            state.dateMap.set(key, time);
            return state;
        },
    },
};

export const PersonReducer: IPersonReducer = {
    updateName: {
        function: (state: IPersonState, runtime: IComponentRuntime, key: string, name: string) => {
            state.personMap.set(key, name);
            return state;
        },
    },
    updateAvailability: {
        function: async (state: IPersonState, runtime: IComponentRuntime, key: string, availability: IAvailability) => {
            const { dateKey, availabilityType } = availability;
            const availabilityMap = await state.personMap.get<IComponentHandle<SharedMap>>(key).get();
            const availabilityItem = availabilityMap.get<IAvailability>(dateKey);
            availabilityItem.availabilityType = availabilityType;
            availabilityMap.set(dateKey, availabilityItem);
            return state;
        },
    },
    addPerson: {
        function: (state: IPersonState, runtime: IComponentRuntime) => {
            const newAvailabilityMap = SharedMap.create(runtime);
            const newPerson: IPerson = {
                key: uuid(),
                name: "",
                availabilityMap: newAvailabilityMap,
                availabilityMapHandle: newAvailabilityMap.handle,
            };
            state.personMap.set(newPerson.key, newPerson);
            return state;
        },
    },
    removePerson: {
        function: (state: IPersonState, runtime: IComponentRuntime, key: string) => {
            if (state.personMap.get(key) !== undefined) {
                state.personMap.set(key, undefined);
            }
            return state;
        },
    },
};
