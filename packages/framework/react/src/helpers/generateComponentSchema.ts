/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import {
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
    IFluidSchema,
} from "../interface";

/**
 * Identifies which values within the Fluid and view states match
 * The view and Fluid matching map identify if the value in the respective states
 * needs a converter or not
 * @param runtime - The component runtime used to create the SharedMap objects
 * @param fluidToView - The fluid to view state conversion mapping
 * @param viewToFluid - The view to fluid conversion state mapping
 * */
export function generateComponentSchema<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    runtime: IComponentRuntime,
    fluidToView: FluidToViewMap<SV, SF>,
    viewToFluid: ViewToFluidMap<SV, SF>,
): IFluidSchema {
    // matching primitives w/ the same key in view and fluid
    // true if needs converter or is component, false if not
    const viewMatchingMap = SharedMap.create(runtime);
    const fluidMatchingMap = SharedMap.create(runtime);

    for (const fluidStateKey of fluidToView.keys()) {
        const value = fluidToView.get(fluidStateKey);
        if (!value) {
            throw Error("Cannot find fluidToView value");
        }
        const {
            type,
            viewKey,
            viewConverter,
        } = value;
        const fluidConverter = viewToFluid.get(viewKey);
        if (fluidConverter === undefined) {
            throw Error(`Failed to find fluid converter for key ${viewKey}`);
        }
        if (type === fluidConverter.type) {
            fluidMatchingMap.set(fluidStateKey as string, false);
        } else if (viewConverter !== undefined) {
            fluidMatchingMap.set(fluidStateKey as string, true);
        } else {
            throw Error(`Failed to find view converter for fluid key ${fluidStateKey}`);
        }
    }

    for (const viewStateKey of viewToFluid.keys()) {
        const value = viewToFluid.get(viewStateKey);
        if (!value) {
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
            throw Error(`Failed to find fluid converter for view key ${viewStateKey}`);
        }
    }

    return { viewMatchingMap, fluidMatchingMap };
}
