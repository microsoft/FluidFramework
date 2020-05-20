/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// This is disabled as we are using state updates to indicate
// when certain promises are resolved
/* eslint-disable @typescript-eslint/no-floating-promises */

import * as React from "react";
import { IDirectoryValueChanged } from "@microsoft/fluid-map-component-definitions";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import {
    IFluidFunctionalComponentViewState,
    FluidProps,
    IFluidComponent,
    IFluidFunctionalComponentFluidState,
    IFluidSchema,
    IFluidSchemaHandles,
} from "./interface";
import {
    updateStateAndComponentMap,
    syncStateAndRoot,
    rootCallbackListener,
    generateComponentSchema,
} from "./algorithms";

export function useStateFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(props: FluidProps<SV,SF>):
[SV, ((newState: SV, fromRootUpdate?: boolean) => void)] {
    const {
        root,
        initialFluidState,
        initialViewState,
        fluidToView,
        viewToFluid,
        dataProps,
    } = props;
    const [ reactState, reactSetState ] = React.useState<SV>(initialViewState);

    const fluidSetState = React.useCallback((newState: Partial<SV>, fromRootUpdate = false) => {
        const newCombinedState = { ...reactState, ...newState, isInitialized: true };
        if (!fromRootUpdate) {
            syncStateAndRoot(
                fromRootUpdate,
                root,
                reactState,
                reactSetState,
                dataProps.fluidComponentMap,
                viewToFluid,
                fluidToView,
            );
        } else {
            reactSetState(newCombinedState);
        }
    }, [root, viewToFluid, reactState, reactSetState, dataProps]);

    const rootCallback = React.useCallback(
        (change: IDirectoryValueChanged, local: boolean) => {
            const callback = rootCallbackListener(
                dataProps.fluidComponentMap,
                true,
                root,
                reactState,
                reactSetState,
                viewToFluid,
                fluidToView,
            );
            return callback(change, local);
        }, [root, fluidToView, viewToFluid, reactState, reactSetState, dataProps]);

    if (viewToFluid !== undefined && !reactState.isInitialized) {
        if (root.get("syncedState") === undefined) {
            root.set("syncedState", initialFluidState);
        }
        let componentSchema = root.get<IFluidSchema>("componentSchema");
        if (componentSchema === undefined) {
            componentSchema = generateComponentSchema(
                dataProps.runtime,
                reactState,
                initialFluidState,
                viewToFluid,
                fluidToView,
            );
            const handles: IFluidSchemaHandles = {
                componentKeyMapHandle: componentSchema.componentKeyMap.handle as IComponentHandle<ISharedMap>,
                fluidMatchingMapHandle: componentSchema.fluidMatchingMap.handle as IComponentHandle<ISharedMap>,
                viewMatchingMapHandle: componentSchema.viewMatchingMap.handle as IComponentHandle<ISharedMap>,
            };
            root.set("componentSchema", handles);
        }
        root.on("valueChanged", rootCallback);
        reactState.isInitialized = true;
        const unlistenedComponentHandles: IComponentHandle[] = [];
        dataProps.fluidComponentMap.forEach((value: IFluidComponent, key: IComponentHandle) => {
            if (!value.isListened && value.component.handle !== undefined) {
                unlistenedComponentHandles.push(value.component.handle);
            }
        });
        updateStateAndComponentMap(
            unlistenedComponentHandles,
            dataProps.fluidComponentMap,
            false,
            root,
            reactState,
            reactSetState,
            rootCallback,
            viewToFluid,
            fluidToView,
        );
    }

    return [reactState, fluidSetState];
}
