/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { SharedMap } from "@fluidframework/map";
import {
    IFluidState,
    IViewState,
    ViewToFluidMap,
    FluidToViewMap,
    IFluidSchema,
} from "../interface";

/**
 * Identifies which values within the Fluid and view states match
 * The view and Fluid matching map identify if the value in the respective states
 * needs a converter or not
 * @param runtime - The data store runtime used to create the SharedMap objects
 * @param fluidToView - The Fluid to view state conversion mapping
 * @param viewToFluid - The view to Fluid conversion state mapping
 * */
export function generateFluidObjectSchema<
    SV extends IViewState,
    SF extends IFluidState
>(
    runtime: IFluidDataStoreRuntime,
    defaultViewState: SV,
    fluidToView: FluidToViewMap<SV, SF>,
    viewToFluid?: ViewToFluidMap<SV, SF>,
): IFluidSchema {
    // matching primitives w/ the same key in view and fluid
    // true if needs converter or is a Fluid object, false if not
    const viewMatchingMap = SharedMap.create(runtime);
    const fluidMatchingMap = SharedMap.create(runtime);
    const storedHandleMap = SharedMap.create(runtime);
    for (const fluidStateKey of fluidToView.keys()) {
        const value = fluidToView.get(fluidStateKey);
        if (value === undefined) {
            throw Error("Cannot find fluidToView value");
        }
        const {
            type,
            viewKey,
            viewConverter,
        } = value;
        const fluidConverter = viewToFluid?.get(viewKey);
        if (fluidConverter === undefined) {
            if (
                defaultViewState[viewKey] !== undefined
                && typeof (defaultViewState[viewKey]) !== type
                && type !== "any"
            ) {
                throw Error(`Failed to find Fluid converter for key ${viewKey}`);
            } else {
                continue;
            }
        }
        if (type === fluidConverter.type) {
            fluidMatchingMap.set(fluidStateKey as string, false);
        } else if (viewConverter !== undefined) {
            fluidMatchingMap.set(fluidStateKey as string, true);
        } else {
            throw Error(`Failed to find view converter for Fluid key ${fluidStateKey}`);
        }
    }

    if (viewToFluid !== undefined) {
        for (const viewStateKey of viewToFluid.keys()) {
            const value = viewToFluid.get(viewStateKey);
            if (value === undefined) {
                throw Error("Cannot find viewToFluid value");
            }
            const {
                type,
                fluidKey,
                fluidConverter,
            } = value;
            const viewConverter = fluidToView.get(fluidKey);
            if (viewConverter === undefined) {
                throw Error(`Failed to find view converter for key ${fluidKey}`);
            }
            if (type === viewConverter.type) {
                viewMatchingMap.set(viewStateKey as string, false);
            } else if (fluidConverter !== undefined) {
                viewMatchingMap.set(viewStateKey as string, true);
            } else {
                throw Error(`Failed to find Fluid converter for view key ${viewStateKey}`);
            }
        }
    }

    return { viewMatchingMap, fluidMatchingMap, storedHandleMap };
}
