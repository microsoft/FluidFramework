/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISharedDirectory, ISharedMap } from "@microsoft/fluid-map";
import {
    FluidProps,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IRootConverter,
    IViewConverter,
    FluidComponentMap,
    IFluidSchema,
} from "./interface";
import {
    rootCallbackListener,
    syncStateAndRoot,
    generateComponentSchema,
    updateStateAndComponentMap,
    setFluidStateToRoot,
    setComponentSchemaToRoot,
    getComponentSchemaFromRoot,
} from "./helpers";

/**
 * A react component with a root, initial props, and a root to state mapping
 */
export abstract class FluidReactComponent<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> extends React.Component<FluidProps<SV,SF>, SV> {
    private readonly _syncedStateId: string;
    private readonly _root: ISharedDirectory;
    private readonly viewToFluid?: Map<keyof SV, IRootConverter<SV,SF>>;
    private readonly fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>;
    private readonly fluidComponentMap?: FluidComponentMap;
    constructor(
        props: FluidProps<SV,SF>,
    ) {
        super(props);
        const {
            syncedStateId,
            fluidToView,
            viewToFluid,
            root,
            initialViewState,
            initialFluidState,
            dataProps,
        } = props;

        this.state = initialViewState;
        this.viewToFluid = viewToFluid;
        this.fluidToView = fluidToView;
        this.fluidComponentMap = dataProps.fluidComponentMap;
        this._syncedStateId = syncedStateId;
        this._root = root;
        let componentSchemaHandles = getComponentSchemaFromRoot(this._syncedStateId, root);
        if (componentSchemaHandles === undefined) {
            const componentSchema: IFluidSchema = generateComponentSchema(
                dataProps.runtime,
                this.state,
                initialFluidState,
                viewToFluid,
                fluidToView,
            );
            componentSchemaHandles = {
                componentKeyMapHandle: componentSchema.componentKeyMap.handle as IComponentHandle<ISharedMap>,
                fluidMatchingMapHandle: componentSchema.fluidMatchingMap.handle as IComponentHandle<ISharedMap>,
                viewMatchingMapHandle: componentSchema.viewMatchingMap.handle as IComponentHandle<ISharedMap>,
            };
            setComponentSchemaToRoot(this._syncedStateId, root, componentSchemaHandles);
        }
        const unlistenedComponentHandles: (IComponentHandle | undefined)[] = [
            componentSchemaHandles.componentKeyMapHandle,
            componentSchemaHandles.fluidMatchingMapHandle,
            componentSchemaHandles.viewMatchingMapHandle,
        ];

        const rootCallback = rootCallbackListener(
            dataProps.fluidComponentMap,
            true,
            this._syncedStateId,
            root,
            this.state,
            this._setStateFromRoot.bind(this),
            viewToFluid,
            fluidToView,
        );

        if (root.get(`syncedState-${this._syncedStateId}`) === undefined) {
            setFluidStateToRoot(this._syncedStateId, root, initialFluidState);
        }
        root.on("valueChanged", rootCallback);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        updateStateAndComponentMap(
            unlistenedComponentHandles,
            dataProps.fluidComponentMap,
            false,
            this._syncedStateId,
            root,
            this.state,
            this._setStateFromRoot.bind(this),
            rootCallback,
            viewToFluid,
            fluidToView,
        );
    }

    private _setStateFromRoot(newState: SV, fromRootUpdate?: boolean) {
        super.setState(newState);
        if (fromRootUpdate) {
            this._setRoot(newState, fromRootUpdate);
        }
    }

    private _setRoot(newState: SV, fromRootUpdate = false) {
        const newCombinedState = { ...this.state, ...newState };
        if (!fromRootUpdate && this.fluidComponentMap) {
            syncStateAndRoot(
                fromRootUpdate,
                this._syncedStateId,
                this._root,
                newCombinedState,
                this._setStateFromRoot.bind(this),
                this.fluidComponentMap,
                this.viewToFluid,
                this.fluidToView,
            );
        } else {
            this.setState(newCombinedState);
        }
    }

    public setState(newState: SV) {
        if (this.fluidComponentMap) {
            syncStateAndRoot(
                false,
                this._syncedStateId,
                this._root,
                newState,
                this._setStateFromRoot.bind(this),
                this.fluidComponentMap,
                this.viewToFluid,
                this.fluidToView,
            );
        } else if (this.state !== newState) {
            return super.setState(newState);
        }
    }
}
