import {
    FluidFunctionalComponentState, FluidStateUpdateFunction,
} from "@microsoft/fluid-aqueduct-react";

export interface IDate {
    key: string;
    date: Date;
}

export enum AvailabilityType {
    No = 0,
    Maybe = 1,
    Yes = 2
}

export interface IAvailability {
    dateKey: string;
    availabilityType: AvailabilityType;
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
    personMap: IPersonMap
}

export interface IDateMap {
    [key: string]: IDate
}

export interface IDateState extends FluidFunctionalComponentState {
    dateMap: IDateMap
}

export interface IComment {
    name: string;
    message: string;
}

export interface ICommentState extends FluidFunctionalComponentState {
    comments: IComment[]
}

export interface ICommentReducer {
    add: FluidStateUpdateFunction<ICommentState>
}

export interface IDateReducer {
    set: FluidStateUpdateFunction<IDateState>
}

export interface IPersonReducer {
    updateName: FluidStateUpdateFunction<IPersonState>
    updateAvailability: FluidStateUpdateFunction<IPersonState>,
    addPerson: FluidStateUpdateFunction<IPersonState>,
    removePerson: FluidStateUpdateFunction<IPersonState>,
}

export interface IViewProps {
    comments?: IComment[];
    dateMap?: IDateMap;
    personMap?: IPersonMap;
    commentDispatch?: (type: keyof ICommentReducer, ...args: any) => void,
    personDispatch?: (type: keyof IPersonReducer, ...args: any) => void,
    dateDispatch?: (type: keyof IDateReducer, ...args: any) => void,
}
