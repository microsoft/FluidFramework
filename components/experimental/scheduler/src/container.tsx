/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IFluidDataProps, useReducerFluid } from "@fluidframework/react";

import { PrimedContext } from "./context";
import {
    ContainerProps,
    IPersonViewState,
    IPersonFluidState,
    IPersonReducer,
    ICommentViewState,
    ICommentFluidState,
    ICommentReducer,
} from "./interface";
import { defaultDates, PersonReducer, CommentReducer } from "./data";
import { View } from "./view";

export function Container(
    props: ContainerProps,
) {
    const [personState, personReducer] = useReducerFluid<
        IPersonViewState,
        IPersonFluidState,
        IPersonReducer,
        {},
        IFluidDataProps
    >({
        syncedComponent: props.syncedComponent,
        syncedStateId: "people",
        reducer: PersonReducer,
        selector: {},
    }, { people: new Map(), dates: defaultDates });

    const [commentState, commentReducer] = useReducerFluid<
        ICommentViewState,
        ICommentFluidState,
        ICommentReducer,
        {},
        IFluidDataProps
    >({
        syncedComponent: props.syncedComponent,
        syncedStateId: "comments",
        reducer: CommentReducer,
        selector: {},
    }, { comments: [] });

    return (
        <PrimedContext.Provider value={{
            personState,
            personReducer,
            commentState,
            commentReducer,
        }}>
            <View />
        </PrimedContext.Provider>
    );
}
