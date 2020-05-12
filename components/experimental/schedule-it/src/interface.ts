import {
    IFluidReducer,
} from "@microsoft/fluid-aqueduct-react";

export interface IDate {
    key: string;
    date: Date;
}

export enum AvailableType {
    No = 0,
    Maybe = 1,
    Yes = 2
}

export interface IAvailability {
    dateKey: string;
    availabilityType: AvailableType;
}

export interface AvailabilityMap{
    [key: string]: IAvailability
}

export interface IPerson {
    availabilityMap: AvailabilityMap;
    name: string;
    key: string;
}

export interface PeopleMap {
    [key: string]: IPerson
}

export interface IPeopleState {
    peopleMap: PeopleMap
}

export interface IDateMap {
    [key: string]: IDate
};

export interface IDateState {
    dateMap: IDateMap
}

export interface ICommentState {
    messages: string[];
}

export interface ICommentReducer extends IFluidReducer<ICommentState>{
    add:  (state: ICommentState, args: {newComment: string}) => ICommentState
}

export interface IDateReducer extends IFluidReducer<IDateState>{
    set: (oldState: IDateState, args: {key: string, time: IDate}) => IDateState
}

export interface IPeopleReducer extends IFluidReducer<IPeopleState> {
    updateName: (state: IPeopleState, args: {key: string, name: string}) => IPeopleState,
    updateAvailability: (state: IPeopleState, args: {key: string, availability: IAvailability}) => IPeopleState,
    addPerson: (state: IPeopleState) => IPeopleState,
    removePerson: (state: IPeopleState, args: {key: string}) => IPeopleState
};
