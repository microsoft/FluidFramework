/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import {
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
    IFluidSchema,
} from "../interface";
import { isEquivalent } from "./utils";

/**
 * Identifies which values within the Fluid and view states match
 * The component key map identifies Fluid components within the Fluid state
 * The view and Fluid matching map identify if the value in the respective states
 * needs a converter or not
 * @param runtime - The component runtime used to create the SharedMap objects
 * @param viewState - A representative view state object
 * @param fluidState - A representative Fluid state object
 * @param viewToFluid - The view to fluid conversion state mapping
 * @param fluidToView - The fluid to view state conversion mapping
 */
export function generateComponentSchema<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
>(
    runtime: IComponentRuntime,
    viewState: SV,
    fluidState: SF,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
): IFluidSchema {
    // matched components w/ matching keys and their handles
    const componentKeyMap = SharedMap.create(runtime);
    // matching primitives w/ the same key in view and fluid
    // true if needs converter or is component, false if not
    const viewMatchingMap = SharedMap.create(runtime);
    const fluidMatchingMap = SharedMap.create(runtime);
    // (k,v) => (handle of component found in view, view key it was found in)
    const unmatchedViewKeys = new Map<IComponentHandle, string>();

    Object.entries(viewState).forEach(([viewKey, viewValue]) => {
        if (isEquivalent(viewValue, fluidState[viewKey])) {
            viewMatchingMap.set(viewKey, false);
        } else if (viewToFluid?.get(viewKey as keyof SV) !== undefined) {
            // It is an object but the types don't match, need a root converter
            viewMatchingMap.set(viewKey, true);
        } else {
            // The values are actually different and we dont have a root converter
            const viewType = typeof viewState[viewKey];
            const fluidType = typeof fluidState[viewKey];
            if (viewValue !== Object(viewValue)) {
                // This value is a primitive
                if (viewType !== fluidType) {
                    throw new Error("Unmatched primitive view keys found with no root converter");
                } else {
                    // It is an object but the types match
                    viewMatchingMap.set(viewKey, false);
                }
            } else {
                // This view value is an object
                if (viewType !== fluidType) {
                    // Object and the types are not the same
                    if (viewValue.IComponent && viewValue.IComponentLoadable && viewValue.IComponentLoadable.handle) {
                        // Types are not the same but it is a Fluid component
                        const loadableComponentHandle = viewValue.IComponentLoadable.handle;
                        if (isEquivalent(loadableComponentHandle, fluidState[viewKey])) {
                            // Types are not the same but the component in the view matches the handle in root
                            componentKeyMap.set(viewKey, viewKey as keyof SF);
                            viewMatchingMap.set(viewKey, true);
                        } else {
                            // Not this component's handle
                            // Maybe its handle is stored somewhere under a different key
                            unmatchedViewKeys.set(loadableComponentHandle, viewKey);
                        }
                    } else {
                        throw new Error("Unmatched view keys found with no root converter");
                    }
                }
            }
        }
    });

    Object.entries(fluidState).forEach(([fluidKey, fluidValue]) => {
        const viewValueOnFluidKey = viewState[fluidKey];
        if (isEquivalent(fluidValue, viewValueOnFluidKey)) {
            fluidMatchingMap.set(fluidKey, false);
        } else if (fluidToView?.get(fluidKey as keyof SF)?.viewConverter !== undefined) {
            fluidMatchingMap.set(fluidKey, true);
        } else {
            // The values are actually different and we dont have a view converter
            const viewType = typeof viewState[fluidKey];
            const fluidType = typeof fluidState[fluidKey];
            if (fluidValue !== Object(fluidValue)) {
                // This value is a primitive
                if (viewType !== fluidType) {
                    throw new Error("Unmatched primitive fluid keys found with no view converter");
                }
            } else {
                // This view value is an object
                if (viewType !== fluidType) {
                    // Object and the types are not the same
                    if (fluidValue.IComponentHandle) {
                        // This is a fluid handle on the root
                        const possibleMatchingKey = unmatchedViewKeys.get(fluidValue.IComponentHandle);
                        if (possibleMatchingKey) {
                            // The handle matched with an earlier one found on the view state
                            componentKeyMap.set(possibleMatchingKey, fluidKey);
                            viewMatchingMap.set(fluidKey, true);
                            fluidMatchingMap.set(fluidKey, true);
                            unmatchedViewKeys.delete(fluidValue.IComponentHandle);
                        } else if (
                            viewValueOnFluidKey
                            && viewValueOnFluidKey.IComponentLoadable
                            && viewValueOnFluidKey.IComponentLoadable.handle
                        ) {
                            // Corresponding view value is a component
                            const viewHandle = viewValueOnFluidKey.IComponentLoadable.handle;
                            const fluidHandle = fluidValue.IComponentHandle;
                            if (isEquivalent(viewHandle, fluidHandle)) {
                                componentKeyMap.set(fluidKey, fluidKey);
                                fluidMatchingMap.set(fluidKey, true);
                            } else {
                                throw new Error("Unmatched handle fluid keys found with no view converter," +
                                    "yet corresponding view key has a component");
                            }
                        } else {
                            throw new Error("Unmatched fluid keys found for a handle with no component converter");
                        }
                    } else {
                        throw new Error("Unmatched view keys found with no root converter");
                    }
                } else {
                    fluidMatchingMap.set(fluidKey, false);
                }
            }
        }
    });

    return { componentKeyMap, viewMatchingMap, fluidMatchingMap };
}
