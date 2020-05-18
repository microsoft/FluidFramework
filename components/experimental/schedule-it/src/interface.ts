/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FluidFunctionalComponentState,
    FluidStateUpdateFunction,
    FluidComponentSelectorFunction,
    IFluidDataProps,
    FluidComponentMap,
} from "@microsoft/fluid-aqueduct-react";
import { SharedMap, ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";

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
    availabilityMapHandle: IComponentHandle<SharedMap>;
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
    add: FluidStateUpdateFunction<ICommentState,IFluidDataProps>
}

export interface IDateReducer {
    set: FluidStateUpdateFunction<IDateState,IFluidDataProps>
}

export interface IPersonReducer {
    updateName: FluidStateUpdateFunction<IPersonState,IFluidDataProps>
    updateAvailability: FluidStateUpdateFunction<IPersonState,IFluidDataProps>,
    addPerson: FluidStateUpdateFunction<IPersonState,IFluidDataProps>,
    removePerson: FluidStateUpdateFunction<IPersonState,IFluidDataProps>,
}

export interface IPersonSelector {
    getAvailabilityMap: FluidComponentSelectorFunction<IPersonState, IFluidDataProps, SharedMap>;
}

export interface IViewProps {
    comments?: IComment[];
    dateMap?: SharedMap;
    personMap?: SharedMap;
    commentDispatch?: (type: keyof ICommentReducer, ...args: any) => void,
    personDispatch?: (type: keyof IPersonReducer, ...args: any) => void,
    dateDispatch?: (type: keyof IDateReducer, ...args: any) => void,
    personFetch?: (type: keyof IPersonSelector, handle: IComponentHandle) => (any | undefined),
}

export interface ScheduleItProps {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    fluidComponentMap: FluidComponentMap;
    initialPersonState: IPersonState;
    initialDateState: IDateState;
    initialCommentState: ICommentState;
}
