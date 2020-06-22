/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ICounterViewState, IClickerReducer } from "@fluid-example/clicker-definitions";

export interface IPrimedContext {
    state?: ICounterViewState,
    dispatch?: IClickerReducer,
}

export const PrimedContext: React.Context<IPrimedContext> = React.createContext({});
