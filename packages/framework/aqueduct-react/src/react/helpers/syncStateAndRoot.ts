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
} from "../interface";
import { getRootFromView } from "./getRootFromView";
import { getViewFromRoot } from "./getViewFromRoot";
import { getFluidStateFromRoot } from "./getFluidStateFromRoot";
import { setFluidStateToRoot } from "./setFluidStateToRoot";
import { getComponentSchemaFromRoot } from "./getComponentSchemaFromRoot";

export function syncStateAndRoot<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    fromRootUpdate: boolean,
    syncedStateId,
    root: ISharedDirectory,
    viewState: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    fluidComponentMap: FluidComponentMap,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
    fluidState?: SF,
) {
    let combinedRootState = fluidState ? {
        ...getFluidStateFromRoot(syncedStateId, root, fluidComponentMap, fluidToView),
        ...fluidState,
    } : getFluidStateFromRoot(syncedStateId, root, fluidComponentMap, fluidToView);
    const componentSchemaHandles = getComponentSchemaFromRoot(syncedStateId, root);
    if (componentSchemaHandles) {
        const {
            componentKeyMapHandle,
            viewMatchingMapHandle,
            fluidMatchingMapHandle,
        } = componentSchemaHandles;
        if (
            componentKeyMapHandle !== undefined
            && viewMatchingMapHandle !== undefined
            && fluidMatchingMapHandle !== undefined) {
            const componentKeyMap = fluidComponentMap.get(componentKeyMapHandle.path)?.component as SharedMap;
            const viewMatchingMap = fluidComponentMap.get(viewMatchingMapHandle.path)?.component as SharedMap;
            const fluidMatchingMap = fluidComponentMap.get(fluidMatchingMapHandle.path)?.component as SharedMap;
            if (
                componentKeyMap !== undefined
                && viewMatchingMap !== undefined
                && fluidMatchingMap !== undefined) {
                Object.entries(viewState).forEach(([viewKey, viewValue]) => {
                    const needsConverter = viewMatchingMap.get(viewKey);
                    let partialRootState = {};
                    if (needsConverter) {
                        partialRootState = getRootFromView(
                            viewState,
                            viewKey as keyof SV,
                            componentKeyMap,
                            viewToFluid,
                        );
                    } else {
                        partialRootState[viewKey] = viewState[viewKey];
                    }

                    if (fromRootUpdate) {
                        combinedRootState = { ...partialRootState, ...combinedRootState };
                    } else {
                        combinedRootState = { ...combinedRootState, ...partialRootState };
                    }
                });

                let combinedViewState = { ...viewState };
                const currentRootState = getFluidStateFromRoot(syncedStateId, root, fluidComponentMap, fluidToView);
                Object.entries(currentRootState).forEach(([fluidKey, fluidValue]) => {
                    const needsConverter = fluidMatchingMap.get(fluidKey);
                    let partialViewState = {};
                    if (needsConverter) {
                        partialViewState = getViewFromRoot(
                            syncedStateId,
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

                if (!fromRootUpdate) {
                    setFluidStateToRoot(syncedStateId, root, combinedRootState);
                    setState(combinedViewState);
                } else {
                    setState(combinedViewState);
                }
            }
        }
    }
}
