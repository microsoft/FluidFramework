import {
    FluidFunctionalComponentState, FluidStateUpdateFunction, FluidAsyncStateUpdateFunction,
} from "@microsoft/fluid-aqueduct-react";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";

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

export interface IDefaultAvailabilityMap{
    [key: string]: IAvailability
}

export interface IDefaultPerson {
    availabilityMap: IDefaultAvailabilityMap;
    name: string;
    key: string;
}

export interface IPerson {
    availabilityMap: SharedMap;
    name: string;
    key: string;
}

export interface IPersonData {
    availabilityMapHandle: IComponentHandle;
    name: string;
    key: string;
}

export interface IDefaultPersonMap {
    [key: string]: IDefaultPerson
}

export interface IPersonState extends FluidFunctionalComponentState {
    personMap: SharedMap;
}

export interface IDefaultDateMap {
    [key: string]: IDate;
}

export interface IDateState extends FluidFunctionalComponentState {
    dateMap: SharedMap;
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
    updateAvailability: FluidAsyncStateUpdateFunction<IPersonState>,
    addPerson: FluidStateUpdateFunction<IPersonState>,
    removePerson: FluidStateUpdateFunction<IPersonState>,
}

export interface IViewProps {
    comments?: IComment[];
    dateMap?: SharedMap;
    personMap?: SharedMap;
    commentDispatch?: (type: keyof ICommentReducer, ...args: any) => void,
    personDispatch?: (type: keyof IPersonReducer, ...args: any) => void,
    dateDispatch?: (type: keyof IDateReducer, ...args: any) => void,
}
