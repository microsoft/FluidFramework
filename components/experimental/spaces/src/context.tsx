/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISpacesViewContext } from "./interfaces";

export const PrimedContext: React.Context<ISpacesViewContext> = React.createContext({});
export const usePrimedContext = () => React.useContext(PrimedContext);
