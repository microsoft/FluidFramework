/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IPersonReducer, AvailabilityType,  IAvailability, IPersonFluid, ICommentReducer } from "../interface";

export const CommentReducer: ICommentReducer = {
    add: {
        function: (state, message: string) => {
            if (state?.fluidState?.comments === undefined) {
                throw Error("State was not initialized prior to dispatch call");
            }
            state.fluidState.comments.insert(state.fluidState.comments.getLength(), [
                { message },
            ]);
            state.viewState.comments = state.fluidState.comments.getItems(0);

            return { state };
        },
    },
};

export const PersonReducer: IPersonReducer = {
    updateAvailability: {
        function: (state, personId: string, availability: IAvailability) => {
            if (state?.fluidState?.people === undefined || state.dataProps === undefined) {
                throw Error("State was not initialized prior to dispatch call");
            }
            const person = state.fluidState.people.get<IPersonFluid>(personId);
            if (person === undefined) {
                throw Error(`Failed to find person with id ${personId}`);
            }
            const availabilities = state.dataProps.fluidComponentMap.get(
                person.availabilitiesHandle.path,
            )?.component as SharedMap;
            if (availabilities === undefined) {
                throw Error(`Failed to find availabilities for person with id ${personId}`);
            }

            availabilities.set(availability.dateKey, availability);
            state.viewState.people.get(personId)?.availabilities.set(availability.dateKey, availability);

            return { state };
        },
    },
    removePerson: {
        function: (state, personId: string) => {
            if (state?.fluidState?.people === undefined) {
                throw Error("State was not initialized prior to dispatch call");
            }
            state.fluidState.people.delete(personId);
            state.viewState.people.delete(personId);

            return { state };
        },
    },
    editDate: {
        function: (state, dateId: string, newDate: Date) => {
            if (state?.fluidState?.dates === undefined) {
                throw Error("State was not initialized prior to dispatch call");
            }
            state.fluidState.dates.set(dateId, newDate);
            state.viewState.dates.set(dateId, newDate);

            return { state };
        },
    },
    addPerson: {
        function: (state, name?: string) => {
            if (state?.fluidState?.people === undefined
                || state?.fluidState?.dates === undefined
                || state.dataProps === undefined
            ) {
                throw Error("State was not initialized prior to dispatch call");
            }
            const availabilitiesView = new Map();
            const availabilitiesFluid = SharedMap.create(state.dataProps.runtime);
            for (const [dateKey] of state.fluidState.dates.entries()) {
                const defaultAvailability: IAvailability = {
                    dateKey,
                    availabilityType: AvailabilityType.Maybe,
                };
                availabilitiesFluid.set(dateKey, defaultAvailability);
                availabilitiesView.set(dateKey, defaultAvailability);
            }

            const newSharedString = SharedString.create(state.dataProps.runtime);
            newSharedString.insertText(0, name ?? "Enter name");
            const newPerson: IPersonFluid = {
                id: uuid(),
                nameHandle: newSharedString.handle as IComponentHandle<SharedString>,
                availabilitiesHandle: availabilitiesFluid.handle as IComponentHandle<SharedMap>,
            };
            state.fluidState.people.set(newPerson.id, newPerson);
            state.viewState.people.set(newPerson.id, {
                id: newPerson.id,
                name: newSharedString,
                availabilities: availabilitiesView,
            });

            state.dataProps.fluidComponentMap.set(newSharedString.handle.path, {
                component: newSharedString,
            });
            state.dataProps.fluidComponentMap.set(availabilitiesFluid.handle.path, {
                component: availabilitiesFluid,
            });
            return { state, newComponentHandles: [
                availabilitiesFluid.handle,
                newSharedString.handle,
            ] };
        },
    },
};
