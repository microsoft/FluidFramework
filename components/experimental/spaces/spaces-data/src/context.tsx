/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISpacesViewContext } from "@fluid-example/spaces-definitions";

export const SpacesPrimedContext: React.Context<ISpacesViewContext> = React.createContext({});
export const useSpacesPrimedContext = () => React.useContext(SpacesPrimedContext);
