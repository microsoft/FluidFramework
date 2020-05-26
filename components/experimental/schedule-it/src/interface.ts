/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidFunctionalComponentViewState,
    FluidStateUpdateFunction,
    FluidComponentSelectorFunction,
    IFluidDataProps,
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    IFluidSelector,
    ICombinedState,
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

interface IPersonState {
    personMap: SharedMap;
}

export interface IPersonViewState extends IFluidFunctionalComponentViewState, IPersonState {}
export interface IPersonFluidState extends IFluidFunctionalComponentFluidState, IPersonState {}

export interface IDefaultDateMap {
    [key: string]: IDate;
}

interface IDateState {
    dateMap: SharedMap;
}

export interface IDateViewState extends IFluidFunctionalComponentViewState, IDateState {}
export interface IDateFluidState extends IFluidFunctionalComponentFluidState, IDateState {}

export interface IComment {
    name: string;
    message: string;
}

interface ICommentState extends IFluidFunctionalComponentViewState {
    comments: IComment[]
}

export interface ICommentViewState extends IFluidFunctionalComponentViewState, ICommentState {}
export interface ICommentFluidState extends IFluidFunctionalComponentFluidState, ICommentState {}

export interface ICommentReducer extends IFluidReducer<ICommentViewState, ICommentFluidState, IFluidDataProps> {
    add: FluidStateUpdateFunction<ICommentViewState,ICommentFluidState,IFluidDataProps>
}

export interface IDateReducer extends IFluidReducer<IDateViewState, IDateFluidState, IFluidDataProps> {
    set: FluidStateUpdateFunction<IDateViewState,IDateFluidState,IFluidDataProps>
}

export interface IPersonReducer extends IFluidReducer<IPersonViewState, IPersonFluidState, IFluidDataProps> {
    updateName: FluidStateUpdateFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>
    updateAvailability: FluidStateUpdateFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>,
    addPerson: FluidStateUpdateFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>,
    removePerson: FluidStateUpdateFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>,
}

export interface IPersonSelector extends IFluidSelector<IPersonViewState,IPersonFluidState,IFluidDataProps> {
    getAvailabilityMap: FluidComponentSelectorFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>;
}

export interface IViewProps {
    commentState?: ICombinedState<ICommentViewState, ICommentFluidState, IFluidDataProps>,
    personState?: ICombinedState<IPersonViewState, IPersonFluidState, IFluidDataProps>,
    dateState?: ICombinedState<IDateViewState, IDateFluidState, IFluidDataProps>,
    commentReducer?: ICommentReducer,
    personReducer?: IPersonReducer,
    dateReducer?: IDateReducer,
    personSelector?: IPersonSelector,
}

export interface ScheduleItProps {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    fluidComponentMap: FluidComponentMap;
    initialPersonState: IPersonState;
    initialDateState: IDateState;
    initialCommentState: ICommentState;
}
