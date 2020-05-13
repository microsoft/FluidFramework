import { v4 as uuid } from "uuid";
import {
    IDate,
    IPerson,
    AvailableType,
    IAvailability,
    IDateState,
    IPersonState,
    ICommentReducer,
    ICommentState,
    IDateReducer,
    IPersonReducer,
    IPersonMap,
    IDateMap,
} from "./interface";

const today = new Date();
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);

export const defaultComments: string[] = [];

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
            today: { dateKey: "today", availabilityType: AvailableType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailableType.Maybe },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailableType.Maybe },
        },
    },
    2: {
        key: "2",
        name: "Tamine",
        availabilityMap: {
            today: { dateKey: "today", availabilityType: AvailableType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailableType.Yes },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailableType.No },
        },
    },
    3: {
        key: "3",
        name: "Jodom",
        availabilityMap: {
            today: { dateKey: "today",  availabilityType: AvailableType.Maybe },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailableType.No },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailableType.Yes },
        },
    },
    4: {
        key: "4",
        name: "Michelle",
        availabilityMap: {
            today: { dateKey: "today", availabilityType: AvailableType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailableType.No },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailableType.Maybe },
        },
    },
};

export const CommentReducer: ICommentReducer = {
    add:  (state: ICommentState, args: {newComment: string}) => {
        state.comments.push(args.newComment);
        return state;
    },
};

export const DateReducer: IDateReducer = {
    set: (state: IDateState, args: {key: string, time: IDate}) => {
        state.dateMap[args.key] = args.time;
        return state;
    },
};

export const PersonReducer: IPersonReducer = {
    updateName: (state: IPersonState, args: {key: string, name: string}) => {
        state.peopleMap[args.key].name = name;
        return state;
    },
    updateAvailability: (state: IPersonState, args: {key: string, availability: IAvailability}) => {
        const { dateKey, availabilityType } = args.availability;
        state.peopleMap[args.key].availabilityMap[dateKey].availabilityType = availabilityType;
        return state;
    },
    addPerson: (state: IPersonState) => {
        const newPerson: IPerson = {
            key: uuid(),
            name: "",
            availabilityMap: {
                today: { dateKey: "today",  availabilityType: AvailableType.No },
                tomorrow: { dateKey: "tomorrow", availabilityType: AvailableType.No },
                dayAfter: { dateKey: "dayAfter", availabilityType: AvailableType.No },
            },
        };
        state.peopleMap[newPerson.key] = newPerson;
        return state;
    },
    removePerson: (state: IPersonState, args: {key: string}) => {
        if (state.peopleMap[args.key] !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete state.peopleMap[args.key];
        }
        return state;
    },
};
