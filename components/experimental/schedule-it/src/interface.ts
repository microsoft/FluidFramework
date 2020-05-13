import {
    IFluidReducer, FluidFunctionalComponentState,
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

export interface IPersonMap {
    [key: string]: IPerson
}

export interface IPersonState extends FluidFunctionalComponentState {
    peopleMap: IPersonMap
}

export interface IDateMap {
    [key: string]: IDate
}

export interface IDateState extends FluidFunctionalComponentState {
    dateMap: IDateMap
}

export interface ICommentState extends FluidFunctionalComponentState {
    comments: string[];
}

export interface ICommentReducer extends IFluidReducer<ICommentState>{
    add:  (state: ICommentState, args: {newComment: string}) => ICommentState
}

export interface IDateReducer extends IFluidReducer<IDateState>{
    set: (oldState: IDateState, args: {key: string, time: IDate}) => IDateState
}

export interface IPersonReducer extends IFluidReducer<IPersonState> {
    updateName: (state: IPersonState, args: {key: string, name: string}) => IPersonState,
    updateAvailability: (state: IPersonState, args: {key: string, availability: IAvailability}) => IPersonState,
    addPerson: (state: IPersonState) => IPersonState,
    removePerson: (state: IPersonState, args: {key: string}) => IPersonState
}
