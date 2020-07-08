/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FluidToViewMap,
    ViewToFluidMap,
} from "@fluidframework/react";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { SharedObjectSequence, SharedString } from "@fluidframework/sequence";
import {
    IPersonViewState,
    IPersonFluidState,
    IPersonFluid,
    ICommentViewState,
    ICommentFluidState,
    IAvailability,
} from "../interface";
import { defaultDates } from "./constants";

export const peopleFluidToView: FluidToViewMap<IPersonViewState,IPersonFluidState> = new Map([
    [
        "people", {
            type: SharedMap.name,
            viewKey: "people",
            viewConverter: (viewState, fluidState, fluidComponentMap) => {
                if (fluidState.people === undefined) {
                    throw Error("Fluid state was not initialized");
                }
                const people = new Map();
                for (const [personKey, personItem] of fluidState.people.entries()) {
                    const personFluid = personItem as IPersonFluid;
                    const availabilitiesView = new Map<string, IAvailability>();
                    const availabilities = fluidComponentMap.get(
                        personFluid.availabilitiesHandle.path,
                    )?.component as SharedMap;
                    const name = fluidComponentMap.get(personFluid.nameHandle.path)?.component as SharedString;
                    if (availabilities !== undefined && name !== undefined) {
                        for (const [dateId, availabilitiesItem] of availabilities.entries()) {
                            availabilitiesView.set(dateId, availabilitiesItem as IAvailability);
                        }
                        people.set(personKey, {
                            id: personKey,
                            name,
                            availabilities: availabilitiesView,
                        });
                    }
                }
                viewState.people = people;
                return viewState;
            },
            sharedObjectCreate: SharedMap.create,
            listenedEvents: ["valueChanged"],
        },
    ],
    [
        "dates", {
            type: SharedMap.name,
            viewKey: "dates",
            viewConverter: (viewState, fluidState) => {
                if (fluidState.dates === undefined) {
                    throw Error("Fluid state was not initialized");
                }
                for (const [dateKey, dateItem] of fluidState.dates.entries()) {
                    viewState.dates.set(dateKey,dateItem);
                }
                return viewState;
            },
            sharedObjectCreate: (runtime: IComponentRuntime) => {
                const dates = SharedMap.create(runtime);
                for (const [dateKey, dateItem] of defaultDates.entries()) {
                    dates.set(dateKey, dateItem);
                }
                return dates;
            },
            listenedEvents: ["valueChanged"],
        },
    ],
]);

export const peopleViewToFluid: ViewToFluidMap<IPersonViewState,IPersonFluidState> = new Map([
    [
        "people", {
            type: "Map",
            fluidKey: "people",
            fluidConverter: (viewState, fluidState) => fluidState,
        },
    ],
    [
        "dates", {
            type: "Map",
            fluidKey: "dates",
            fluidConverter: (viewState, fluidState) => fluidState,
        },
    ],
]);

export const commentsFluidToView: FluidToViewMap<ICommentViewState,ICommentFluidState> = new Map([
    [
        "comments", {
            type: SharedObjectSequence.name,
            viewKey: "comments",
            viewConverter: (viewState, fluidState) => {
                if (fluidState.comments === undefined) {
                    throw Error("Fluid state was not initialized");
                }
                viewState.comments = fluidState.comments.getItems(0);
                return viewState;
            },
            sharedObjectCreate: SharedObjectSequence.create,
            listenedEvents: ["valueChanged"],
        },
    ],
]);

export const commentsViewToFluid: ViewToFluidMap<ICommentViewState,ICommentFluidState> = new Map([
    [
        "comments", {
            type: "array",
            fluidKey: "comments",
            fluidConverter: (viewState, fluidState) => {
                if (fluidState.comments === undefined) {
                    throw Error("Fluid state was not initialized");
                }
                viewState.comments = fluidState.comments.getItems(0);
                return fluidState;
            },
        },
    ],
]);
