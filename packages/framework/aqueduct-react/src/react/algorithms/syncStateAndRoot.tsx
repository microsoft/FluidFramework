/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory, SharedMap } from "@microsoft/fluid-map";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
    IFluidSchemaHandles,
} from "../interface";
import { getRootFromView } from "./getRootFromView";
import { getViewFromRoot } from "./getViewFromRoot";
import { isEquivalent } from "./utils";

export function syncStateAndRoot<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    fromRootUpdate: boolean,
    root: ISharedDirectory,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    fluidComponentMap: FluidComponentMap,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
) {
    let combinedRootState = root.get<SF>("syncedState");
    const {
        componentKeyMapHandle,
        viewMatchingMapHandle,
        fluidMatchingMapHandle,
    } = root.get<IFluidSchemaHandles>("componentSchema");
    if (
        componentKeyMapHandle !== undefined
        && viewMatchingMapHandle !== undefined
        && fluidMatchingMapHandle !== undefined) {
        const componentKeyMap = fluidComponentMap.get(componentKeyMapHandle)?.component as SharedMap;
        const viewMatchingMap = fluidComponentMap.get(viewMatchingMapHandle)?.component as SharedMap;
        const fluidMatchingMap = fluidComponentMap.get(fluidMatchingMapHandle)?.component as SharedMap;
        if (
            componentKeyMap !== undefined
            && viewMatchingMap !== undefined
            && fluidMatchingMap !== undefined) {
            Object.entries(state).forEach(([viewKey, viewValue]) => {
                const needsConverter = viewMatchingMap.get(viewKey);
                let partialRootState = {};
                if (needsConverter) {
                    partialRootState = getRootFromView(
                        state,
                        viewKey as keyof SV,
                        componentKeyMap,
                        viewToFluid,
                    );
                } else {
                    partialRootState[viewKey] = state[viewKey];
                }

                if (fromRootUpdate) {
                    combinedRootState = { ...partialRootState, ...combinedRootState };
                } else {
                    combinedRootState = { ...combinedRootState, ...partialRootState };
                }
            });

            let combinedViewState = { ...state };
            const currentRootState = root.get("syncedState");
            Object.entries(currentRootState).forEach(([fluidKey, fluidValue]) => {
                const needsConverter = fluidMatchingMap.get(fluidKey);
                let partialViewState = {};
                if (needsConverter) {
                    partialViewState = getViewFromRoot(
                        root,
                        fluidKey as keyof SF,
                        fluidComponentMap,
                        fluidToView,
                        combinedRootState,
                    );
                } else {
                    partialViewState[fluidKey] = currentRootState[fluidKey];
                }
                if (fromRootUpdate) {
                    combinedViewState = { ...combinedViewState, ...partialViewState  };
                } else {
                    combinedViewState = { ...partialViewState, ...combinedViewState };
                }
            });

            if (!isEquivalent(combinedRootState, currentRootState)) {
                root.set("syncedState", combinedRootState);
                setState(combinedViewState);
            } else {
                setState(combinedViewState);
            }
        }
    }
}
