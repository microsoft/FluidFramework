/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ICombinedState, IFluidDataProps } from "@fluidframework/react";
import {
    IPersonViewState,
    ICommentViewState,
    IPersonReducer,
    ICommentReducer,
    IPersonFluidState,
    ICommentFluidState,
} from "./interface";

export interface IPrimedContext {
    personState?: ICombinedState<IPersonViewState, IPersonFluidState, IFluidDataProps>,
    commentState?: ICombinedState<ICommentViewState, ICommentFluidState, IFluidDataProps>,
    personReducer?: IPersonReducer,
    commentReducer?: ICommentReducer,
}

export const PrimedContext: React.Context<IPrimedContext> = React.createContext({});
