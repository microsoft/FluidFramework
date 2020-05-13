import { v4 as uuid } from "uuid";
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
    IPersonMap,
    IDateMap,
    IComment,
} from "./interface";

const today = new Date();
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);

export const defaultComments: IComment[] = [];

export const defaultDates: IDateMap = {
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

export const defaultPeople: IPersonMap = {
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
        function: (state: ICommentState, newComment: string, name: string) => {
            state.comments.push({ message: newComment, name });
            return state;
        },
    },
};

export const DateReducer: IDateReducer = {
    set: {
        function: (state: IDateState, key: string, time: IDate) => {
            state.dateMap[key] = time;
            return state;
        },
    },
};

export const PersonReducer: IPersonReducer = {
    updateName: {
        function: (state: IPersonState, args: {key: string, name: string}) => {
            state.personMap[args.key].name = name;
            return state;
        },
    },
    updateAvailability: {
        function: (state: IPersonState, key: string, availability: IAvailability) => {
            const { dateKey, availabilityType } = availability;
            state.personMap[key].availabilityMap[dateKey].availabilityType = availabilityType;
            return state;
        },
    },
    addPerson: {
        function: (state: IPersonState) => {
            const newPerson: IPerson = {
                key: uuid(),
                name: "",
                availabilityMap: {
                    today: { dateKey: "today",  availabilityType: AvailabilityType.No },
                    tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.No },
                    dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.No },
                },
            };
            state.personMap[newPerson.key] = newPerson;
            return state;
        },
    },
    removePerson: {
        function: (state: IPersonState, args: {key: string}) => {
            if (state.personMap[args.key] !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete state.personMap[args.key];
            }
            return state;
        },
    },
};
