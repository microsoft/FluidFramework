/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    IFluidDataProps,
    FluidStateUpdateFunction,
    SyncedComponent,
} from "@fluidframework/react";
import { SharedString } from "@fluidframework/sequence";
import { SharedMap } from "@fluidframework/map";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";

export enum AvailabilityType {
    No = 0,
    Maybe = 1,
    Yes = 2
}

export interface IAvailability {
    dateKey: string,
    availabilityType: AvailabilityType,
}

export interface IPersonView {
    id: string;
    name: SharedString;
    // (k,v) -> (dateId, availabilityType)
    availabilities: Map<string, IAvailability>;
}

export interface IPersonViewState  extends IFluidFunctionalComponentViewState {
    people: Map<string, IPersonView>;
    dates: Map<string, Date>;
}

export interface IPersonFluid {
    id: string;
    nameHandle: IComponentHandle<SharedString>;
    availabilitiesHandle: IComponentHandle<SharedMap>;
}

export interface IPersonFluidState extends IFluidFunctionalComponentFluidState {
    people: SharedMap;
    dates: SharedMap;
}

export interface IComment {
    message: string;
}

export interface IPersonReducer extends IFluidReducer<IPersonViewState, IPersonFluidState, IFluidDataProps> {
    updateAvailability: FluidStateUpdateFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>,
    addPerson: FluidStateUpdateFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>,
    removePerson: FluidStateUpdateFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>,
    editDate: FluidStateUpdateFunction<IPersonViewState,IPersonFluidState,IFluidDataProps>,
}

export interface ContainerProps {
    syncedComponent: SyncedComponent;
}
