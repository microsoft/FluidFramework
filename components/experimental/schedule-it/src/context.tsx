/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IViewProps } from "./interface";

export const PrimedContext: React.Context<IViewProps> = React.createContext({});
export const usePrimedContext = () => React.useContext(PrimedContext);
