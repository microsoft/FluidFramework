/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { useReducerFluid, FluidReducerProps } from "@microsoft/fluid-aqueduct-react";
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
    const { handleMap, root, runtime } = props;
    const stateToRootComments = new Map<keyof ICommentState, string>();
    stateToRootComments.set("comments", "comments");
    const commentProps: FluidReducerProps<ICommentState, ICommentReducer, {}> = {
        root,
        runtime,
        handleMap,
        initialState: props.initialCommentState,
        reducer: CommentReducer,
        selector: {},
        stateToRoot: stateToRootComments,
    };
    return useReducerFluid<ICommentState, ICommentReducer, {}>(commentProps);
}

export function usePersonReducer(props: ScheduleItProps) {
    const { handleMap, root, runtime } = props;
    const stateToRootPerson = new Map<keyof IPersonState, string>();
    stateToRootPerson.set("personMap", PeopleRootKey);
    const personProps: FluidReducerProps<IPersonState, IPersonReducer, IPersonSelector> = {
        root,
        runtime,
        handleMap,
        initialState: props.initialPersonState,
        reducer: PersonReducer,
        selector: PersonSelector,
        stateToRoot: stateToRootPerson,
    };
    return useReducerFluid<IPersonState, IPersonReducer, IPersonSelector>(personProps);
}

export function useDateReducer(props: ScheduleItProps) {
    const { handleMap, root, runtime } = props;
    const stateToRootDates = new Map<keyof IDateState, string>();
    stateToRootDates.set("dateMap", DatesRootKey);
    const dateProps: FluidReducerProps<IDateState, IDateReducer, {}> = {
        root,
        runtime,
        handleMap,
        initialState: props.initialDateState,
        reducer: DateReducer,
        selector: {},
        stateToRoot: stateToRootDates,
    };
    return useReducerFluid<IDateState, IDateReducer, {}>(dateProps);
}
