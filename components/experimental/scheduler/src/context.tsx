/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ICombinedState, IFluidDataProps, IPureSyncedArrayReducer } from "@fluidframework/react";
import {
    IPersonViewState,
    IPersonReducer,
    IPersonFluidState,
    IComment,
} from "./interface";

export interface IPrimedContext {
    personState?: ICombinedState<IPersonViewState, IPersonFluidState, IFluidDataProps>,
    commentState?: IComment[],
    personReducer?: IPersonReducer,
    commentReducer?: IPureSyncedArrayReducer<IComment>,
}

export const PrimedContext: React.Context<IPrimedContext> = React.createContext({});
