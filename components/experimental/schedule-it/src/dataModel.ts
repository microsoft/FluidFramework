import {
    IDate,
    IPerson,
    AvailableType,
    IAvailability, IDateState, IPeopleState, ICommentReducer, ICommentState, IDateReducer, IPeopleReducer } from "./interface";
import { v4 as uuid } from "uuid";

const today = new Date();
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);

export const defaultDates: IDate[] = [
    {
        key: "today",
        date: today
    },
    {
        key: "tomorrow",
        date: tomorrow
    },
    {
        key: "dayAfter",
        date: dayAfter
    }
];

export const defaultPeople: IPerson[] = [
    {
      key: "1",
      name: "Bruno",
      availabilityMap: {
        "today": {dateKey: "today", availabilityType: AvailableType.Yes},
        "tomorrow": {dateKey: "tomorrow", availabilityType: AvailableType.Maybe},
        "dayAfter": {dateKey: "dayAfter", availabilityType: AvailableType.Maybe},
      },
    },
    {
      key: "2",
      name: "Tamine",
      availabilityMap: {
        "today": {dateKey: "today", availabilityType: AvailableType.Yes},
        "tomorrow": {dateKey: "tomorrow", availabilityType: AvailableType.Yes},
        "dayAfter": {dateKey: "dayAfter", availabilityType: AvailableType.No},
      },
    },
    {
      key: "3",
      name: "Jodom",
      availabilityMap: {
        "today": {dateKey: "today",  availabilityType: AvailableType.Maybe},
        "tomorrow": {dateKey: "tomorrow", availabilityType: AvailableType.No},
        "dayAfter": {dateKey: "dayAfter", availabilityType: AvailableType.Yes},
      },
    },
    {
      key: "4",
      name: "Michelle",
      availabilityMap: {
        "today": {dateKey: "today", availabilityType: AvailableType.Yes},
        "tomorrow": {dateKey: "tomorrow", availabilityType: AvailableType.No},
        "dayAfter": {dateKey: "dayAfter", availabilityType: AvailableType.Maybe},
      },
    },
];

export const CommentReducer: ICommentReducer = {
    add:  (state: ICommentState, args: {newComment: string}) => {
        state.messages.push(args.newComment);
        return state;
    },
};

export const DateReducer: IDateReducer = {
    set: (state: IDateState, args: {key: string, time: IDate}) => {
        state.dateMap[args.key] = args.time;
        return state;
    },
}

export const PeopleReducer: IPeopleReducer = {
    updateName: (state: IPeopleState, args: {key: string, name: string}) => {
        state.peopleMap[args.key].name = name;
        return state; 
    },
    updateAvailability: (state: IPeopleState, args: {key: string, availability: IAvailability}) => {
        const {dateKey, availabilityType} = args.availability;
        state.peopleMap[args.key].availabilityMap[dateKey].availabilityType = availabilityType;
        return state; 
    },
    addPerson: (state: IPeopleState) => {
        const newPerson: IPerson = {
            key: uuid(),
            name: "",
            availabilityMap: {
                "today": {dateKey: "today",  availabilityType: AvailableType.No},
                "tomorrow": {dateKey: "tomorrow", availabilityType: AvailableType.No},
                "dayAfter": {dateKey: "dayAfter", availabilityType: AvailableType.No},
            },
        };
        state.peopleMap[newPerson.key] = newPerson;
        return state;
    },
    removePerson: (state: IPeopleState, args: {key: string}) => {
        if (state.peopleMap[args.key]) {
            delete state.peopleMap[args.key];
        }
        return state;
    }
}