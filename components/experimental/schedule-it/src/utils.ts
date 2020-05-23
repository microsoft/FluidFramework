/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    useReducerFluid,
    IFluidReducerProps,
    IFluidDataProps,
    FluidToViewMap,
    ViewToFluidMap,
} from "@microsoft/fluid-aqueduct-react";
import { SharedMap } from "@microsoft/fluid-map";
import {
    CommentReducer,
    PersonReducer,
    DateReducer,
    PersonSelector,
} from "./data";
import {
    ICommentReducer,
    IPersonReducer,
    IDateReducer,
    IPersonSelector,
    ScheduleItProps,
    IDateViewState,
    IDateFluidState,
    ICommentViewState,
    ICommentFluidState,
    IPersonViewState,
    IPersonFluidState,
} from "./interface";

export const CommentsRootKey = "comments";
export const PeopleRootKey = "people";
export const DatesRootKey = "dates";

export function useCommentReducer(props: ScheduleItProps) {
    const { fluidComponentMap, root, runtime } = props;
    const commentProps: IFluidReducerProps<
    ICommentViewState,
    ICommentFluidState,
    ICommentReducer,
    {},
    IFluidDataProps> = {
        syncedStateId: "comments-reducer",
        root,
        dataProps: {
            fluidComponentMap,
            runtime,
        },
        initialViewState: props.initialCommentState,
        initialFluidState: props.initialCommentState,
        reducer: CommentReducer,
        selector: {},
    };
    return useReducerFluid(commentProps);
}

export function usePersonReducer(props: ScheduleItProps) {
    const { fluidComponentMap, root, runtime } = props;
    const personFluidToViewMap: FluidToViewMap<IPersonViewState, IPersonFluidState> = new Map();
    personFluidToViewMap.set("personMap", {
        stateKey: "personMap",
        viewConverter: (syncedState: Partial<IPersonViewState>) => {
            return {
                personMap: syncedState.personMap,
            };
        },
        rootKey: PeopleRootKey,
        fluidObjectType: SharedMap.name,
    });
    const personViewToFluidMap: ViewToFluidMap<IPersonViewState, IPersonFluidState> = new Map();
    personViewToFluidMap.set("personMap", {
        rootKey: "personMap",
    });
    const personProps: IFluidReducerProps<
    IPersonViewState,
    IPersonFluidState,
    IPersonReducer,
    IPersonSelector,
    IFluidDataProps> = {
        syncedStateId: "people-reducer",
        root,
        dataProps: {
            fluidComponentMap,
            runtime,
        },
        initialViewState: props.initialPersonState,
        initialFluidState: props.initialPersonState,
        reducer: PersonReducer,
        selector: PersonSelector,
        viewToFluid: personViewToFluidMap,
        fluidToView: personFluidToViewMap,
    };
    return useReducerFluid(personProps);
}

export function useDateReducer(props: ScheduleItProps) {
    const { fluidComponentMap, root, runtime } = props;
    const dateFluidToViewMap: FluidToViewMap<IDateViewState, IDateFluidState> = new Map();
    dateFluidToViewMap.set("dateMap", {
        stateKey: "dateMap",
        viewConverter: (syncedState: Partial<IDateViewState>) => {
            return {
                dateMap: syncedState.dateMap,
            };
        },
        rootKey: DatesRootKey,
        fluidObjectType: SharedMap.name,
    });
    const dateViewToFluidMap: ViewToFluidMap<IDateViewState, IDateFluidState> = new Map();
    dateViewToFluidMap.set("dateMap", {
        rootKey: "dateMap",
    });
    const dateProps: IFluidReducerProps<
    IDateViewState,
    IDateFluidState,
    IDateReducer,
    {},
    IFluidDataProps> = {
        syncedStateId: "date-reducer",
        root,
        dataProps: {
            fluidComponentMap,
            runtime,
        },
        initialViewState: props.initialDateState,
        initialFluidState: props.initialDateState,
        reducer: DateReducer,
        selector: {},
        viewToFluid: dateViewToFluidMap,
        fluidToView: dateFluidToViewMap,
    };
    return useReducerFluid(dateProps);
}
