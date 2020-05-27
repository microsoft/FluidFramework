/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// This is disabled as we are using state updates to indicate
// when certain promises are resolved
/* eslint-disable @typescript-eslint/no-floating-promises */

import * as React from "react";
import { IDirectoryValueChanged, ISharedMap } from "@fluidframework/map";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import {
    IFluidFunctionalComponentViewState,
    FluidProps,
    IFluidComponent,
    IFluidFunctionalComponentFluidState,
    IFluidSchema,
} from "./interface";
import {
    updateStateAndComponentMap,
    syncStateAndRoot,
    rootCallbackListener,
    generateComponentSchema,
    setFluidStateToRoot,
    setComponentSchemaToRoot,
    getComponentSchemaFromRoot,
} from "./helpers";

export function useStateFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(props: FluidProps<SV,SF>):
[SV, ((newState: SV, fromRootUpdate?: boolean) => void)] {
    const {
        syncedStateId,
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
                syncedStateId,
                root,
                newCombinedState,
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
                syncedStateId,
                root,
                reactState,
                reactSetState,
                viewToFluid,
                fluidToView,
            );
            return callback(change, local);
        }, [root, fluidToView, viewToFluid, reactState, reactSetState, dataProps]);
    if (!reactState.isInitialized) {
        let loadFromRoot = true;
        let storedFluidState = root.get(`syncedState-${syncedStateId}`);
        if (storedFluidState === undefined) {
            loadFromRoot = false;
            storedFluidState = initialFluidState;
            setFluidStateToRoot(syncedStateId, root, initialFluidState);
        }
        let componentSchemaHandles = getComponentSchemaFromRoot(syncedStateId, root);
        if (componentSchemaHandles === undefined) {
            const componentSchema: IFluidSchema = generateComponentSchema(
                dataProps.runtime,
                reactState,
                storedFluidState,
                viewToFluid,
                fluidToView,
            );
            componentSchemaHandles = {
                componentKeyMapHandle: componentSchema.componentKeyMap.handle as IComponentHandle<ISharedMap>,
                fluidMatchingMapHandle: componentSchema.fluidMatchingMap.handle as IComponentHandle<ISharedMap>,
                viewMatchingMapHandle: componentSchema.viewMatchingMap.handle as IComponentHandle<ISharedMap>,
            };
            setComponentSchemaToRoot(syncedStateId, root, componentSchemaHandles);
        }
        root.on("valueChanged", rootCallback);
        reactState.isInitialized = true;
        reactState.syncedStateId = syncedStateId;
        const unlistenedComponentHandles: (IComponentHandle | undefined)[] = [
            componentSchemaHandles.componentKeyMapHandle,
            componentSchemaHandles.fluidMatchingMapHandle,
            componentSchemaHandles.viewMatchingMapHandle,
        ];
        dataProps.fluidComponentMap.forEach((value: IFluidComponent, k) => {
            if (!value.isListened && value.component?.handle !== undefined) {
                unlistenedComponentHandles.push(value.component.handle);
            }
        });
        updateStateAndComponentMap<SV,SF>(
            unlistenedComponentHandles,
            dataProps.fluidComponentMap,
            loadFromRoot,
            syncedStateId,
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
