/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";
import { IDirectoryValueChanged } from "@microsoft/fluid-map-component-definitions";
import {
    FluidComponentMap,
    ViewToFluidMap,
    FluidToViewMap,
} from "../interface";
import { syncStateAndRoot } from "./syncStateAndRoot";
import { getByValue } from "./utils";
import { getViewFromRoot } from "./getViewFromRoot";

export const rootCallbackListener = <SV,SF>(
    fluidComponentMap: FluidComponentMap,
    fromRootUpdate: boolean,
    root: ISharedDirectory,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
) => ((change: IDirectoryValueChanged, local: boolean) => {
    if (!local) {
        console.log(change.key);
        const viewToFluidKeys: string[] = viewToFluid
            ? Array.from(viewToFluid.values()).map((item) => item.rootKey as string)
            : [];
        if (change.key === "syncedState") {
            syncStateAndRoot(
                fromRootUpdate,
                root,
                state,
                setState,
                fluidComponentMap,
                viewToFluid,
                fluidToView,
            );
        } else if (viewToFluid
            && (viewToFluidKeys).includes(change.key)
            || (change.keyPrefix !== undefined && viewToFluidKeys.includes(change.keyPrefix))) {
            const rootKey = change.key;
            const stateKey = getByValue(rootKey, viewToFluid);
            if (stateKey) {
                const newPartialState = getViewFromRoot(
                    root,
                    rootKey as keyof SF,
                    fluidComponentMap,
                    fluidToView,
                );
                setState({ ...state, ...newPartialState, ...{ fluidComponentMap } }, true);
            }
        }
    }
});
