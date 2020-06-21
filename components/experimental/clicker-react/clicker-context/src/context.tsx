/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ICounterState } from "@fluid-example/clicker-definitions";

export interface IPrimedContext {
    state?: ICounterState,
    setState?: (newState: ICounterState) => void,
}

export const PrimedContext: React.Context<IPrimedContext> = React.createContext({});
