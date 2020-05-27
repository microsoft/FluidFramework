/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDirectoryValueChanged, ISharedDirectory } from "@fluidframework/map";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
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
    viewState: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
    fluidState?: SF,
) => asyncForEach(
    newHandleList,
    addComponent,
    fluidComponentMap,
    rootCallback,
).then(() => syncStateAndRoot(
    fromRootUpdate,
    syncedStateId,
    root,
    viewState,
    setState,
    fluidComponentMap,
    viewToFluid,
    fluidToView,
    fluidState,
));
