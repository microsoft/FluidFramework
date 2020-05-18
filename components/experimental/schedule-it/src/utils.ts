/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { useReducerFluid, FluidReducerProps, IFluidDataProps } from "@microsoft/fluid-aqueduct-react";
import {
    CommentReducer,
    PersonReducer,
    DateReducer,
    PersonSelector,
} from "./data";
import {
    IDateState,
    ICommentReducer,
    ICommentState,
    IPersonState,
    IPersonReducer,
    IDateReducer,
    IPersonSelector,
    ScheduleItProps,
} from "./interface";

export const CommentsRootKey = "comments";
export const PeopleRootKey = "people";
export const DatesRootKey = "dates";

export function useCommentReducer(props: ScheduleItProps) {
    const { fluidComponentMap, root, runtime } = props;
    const stateToRootComments = new Map<keyof ICommentState, string>();
    stateToRootComments.set("comments", "comments");
    const commentProps: FluidReducerProps<ICommentState, ICommentReducer, {}, IFluidDataProps> = {
        root,
        runtime,
        fluidComponentMap,
        initialState: props.initialCommentState,
        reducer: CommentReducer,
        selector: {},
        stateToRoot: stateToRootComments,
    };
    return useReducerFluid<ICommentState, ICommentReducer, {}, IFluidDataProps>(commentProps);
}

export function usePersonReducer(props: ScheduleItProps) {
    const { fluidComponentMap, root, runtime } = props;
    const stateToRootPerson = new Map<keyof IPersonState, string>();
    stateToRootPerson.set("personMap", PeopleRootKey);
    const personProps: FluidReducerProps<IPersonState, IPersonReducer, IPersonSelector, IFluidDataProps> = {
        root,
        runtime,
        fluidComponentMap,
        initialState: props.initialPersonState,
        reducer: PersonReducer,
        selector: PersonSelector,
        stateToRoot: stateToRootPerson,
    };
    return useReducerFluid<IPersonState, IPersonReducer, IPersonSelector, IFluidDataProps>(personProps);
}

export function useDateReducer(props: ScheduleItProps) {
    const { fluidComponentMap, root, runtime } = props;
    const stateToRootDates = new Map<keyof IDateState, string>();
    stateToRootDates.set("dateMap", DatesRootKey);
    const dateProps: FluidReducerProps<IDateState, IDateReducer, {}, IFluidDataProps> = {
        root,
        runtime,
        fluidComponentMap,
        initialState: props.initialDateState,
        reducer: DateReducer,
        selector: {},
        stateToRoot: stateToRootDates,
    };
    return useReducerFluid<IDateState, IDateReducer, {}, IFluidDataProps>(dateProps);
}
