/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IFluidDataProps, useReducerFluid, usePureSyncedArrayReducerFluid } from "@fluidframework/react";

import { PrimedContext } from "./context";
import {
    ContainerProps,
    IPersonViewState,
    IPersonFluidState,
    IPersonReducer,
    IComment,
} from "./interface";
import { defaultDates, PersonReducer } from "./data";
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

    const [commentState, commentReducer] = usePureSyncedArrayReducerFluid<IComment>(
        props.syncedComponent,
        "comments",
    );

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
