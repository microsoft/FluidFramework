/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IDirectoryValueChanged } from "@microsoft/fluid-map-component-definitions";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
} from "../interface";
import { addComponent, asyncForEach } from "./utils";
import { syncStateAndRoot } from "./syncStateAndRoot";

export const updateStateAndComponentMap = async <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    newHandleList: (IComponentHandle | undefined)[],
    fluidComponentMap: FluidComponentMap,
    fromRootUpdate: boolean,
    syncedStateId: string,
    root: ISharedDirectory,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
) => asyncForEach(
    newHandleList,
    addComponent,
    fluidComponentMap,
    rootCallback,
).then(() => syncStateAndRoot(
    fromRootUpdate,
    syncedStateId,
    root,
    state,
    setState,
    fluidComponentMap,
    viewToFluid,
    fluidToView,
));
