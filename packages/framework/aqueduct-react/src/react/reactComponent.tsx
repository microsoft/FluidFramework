/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { ISharedDirectory, ISharedMap } from "@fluidframework/map";
import { Deferred } from "@fluidframework/common-utils";
import {
    IFluidProps,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IFluidConverter,
    IViewConverter,
    IFluidSchema,
    IFluidComponent,
    IFluidDataProps,
} from "./interface";
import {
    rootCallbackListener,
    syncStateAndRoot,
    generateComponentSchema,
    updateStateAndComponentMap,
    setFluidStateToRoot,
    setComponentSchemaToRoot,
    getComponentSchemaFromRoot,
    getFluidStateFromRoot,
} from "./helpers";

/**
 * A react component with a root, initial props, and a root to state mapping
 */
export abstract class FluidReactComponent<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> extends React.Component<IFluidProps<SV,SF>, SV> {
    private readonly _syncedStateId: string;
    private readonly _root: ISharedDirectory;
    private readonly _dataProps: IFluidDataProps;
    private readonly _viewToFluid?: Map<keyof SV, IFluidConverter<SV,SF>>;
    private readonly _fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>;
    private readonly _initialFluidState: SF;
    private readonly _deferredInitP: Deferred<void>;
    private _initQueue: Promise<void>;
    constructor(
        props: IFluidProps<SV,SF>,
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
        this._viewToFluid = viewToFluid;
        this._fluidToView = fluidToView;
        this._syncedStateId = syncedStateId;
        this._root = root;
        this._dataProps = dataProps;
        this._initialFluidState = initialFluidState;
        this._deferredInitP = new Deferred<void>();
        this._initQueue = this._deferredInitP.promise;
    }

    public async componentDidMount() {
        let componentSchemaHandles = getComponentSchemaFromRoot(this._syncedStateId, this._root);
        // If the stored schema is undefined on this root, i.e. it is the first time this
        // component is being loaded, generate it and store it
        if (componentSchemaHandles === undefined) {
            const componentSchema: IFluidSchema = generateComponentSchema(
                this._dataProps.runtime,
                this.state,
                this._initialFluidState,
                this._viewToFluid,
                this._fluidToView,
            );
            componentSchemaHandles = {
                componentKeyMapHandle: componentSchema.componentKeyMap.handle as IComponentHandle<ISharedMap>,
                fluidMatchingMapHandle: componentSchema.fluidMatchingMap.handle as IComponentHandle<ISharedMap>,
                viewMatchingMapHandle: componentSchema.viewMatchingMap.handle as IComponentHandle<ISharedMap>,
            };
            setComponentSchemaToRoot(this._syncedStateId, this._root, componentSchemaHandles);
        }

        // We should have component schemas now, either freshly generated or from the root
        if (
            componentSchemaHandles.componentKeyMapHandle === undefined
            || componentSchemaHandles.viewMatchingMapHandle === undefined
            || componentSchemaHandles.fluidMatchingMapHandle === undefined) {
            throw Error("Failed to generate schema handles for the component");
        }

        // Add the list of SharedMap handles for the schema and any unlistened handles passed in through the component
        // map to the list of handles we will fetch and start listening to
        const unlistenedComponentHandles: IComponentHandle[] = [
            componentSchemaHandles.componentKeyMapHandle,
            componentSchemaHandles.fluidMatchingMapHandle,
            componentSchemaHandles.viewMatchingMapHandle,
        ];
        const unlistenedMapHandles = [...unlistenedComponentHandles];
        this._dataProps.fluidComponentMap.forEach((value: IFluidComponent, k) => {
            if (!value.isListened && value.component?.handle !== undefined) {
                unlistenedComponentHandles.push(value.component.handle);
            }
        });

        // Define the root callback listener that will be responsible for triggering state updates on root value changes
        const rootCallback = rootCallbackListener(
            this._dataProps.fluidComponentMap,
            this._syncedStateId,
            this._root,
            this._dataProps.runtime,
            this.state,
            this._setStateFromRoot.bind(this),
            { ...this._initialFluidState },
            this._viewToFluid,
            this._fluidToView,
        );

        // Check if there is a synced state value already stored, i.e. if the component has been loaded before
        let loadFromRoot = true;
        const storedFluidStateHandle = this._root.get(`syncedState-${this._syncedStateId}`);
        if (storedFluidStateHandle === undefined) {
            loadFromRoot = false;
            const syncedStateHandle = setFluidStateToRoot(
                this._syncedStateId,
                this._root,
                this._dataProps.runtime,
                this._dataProps.fluidComponentMap,
                this._initialFluidState,
                this._fluidToView,
            );
            unlistenedComponentHandles.push(syncedStateHandle);
            unlistenedMapHandles.push(syncedStateHandle);
        } else {
            unlistenedComponentHandles.push(storedFluidStateHandle);
            unlistenedMapHandles.push(storedFluidStateHandle);
        }

        // Initialize the FluidComponentMap with our data handles
        for (const handle of unlistenedMapHandles) {
            this._dataProps.fluidComponentMap.set(handle.path, {
                isListened: false,
                isRuntimeMap: true,
            });
        }

        // Add the callback to the component's own root
        this._root.on("valueChanged", rootCallback);

        // Add the callback to all the unlistened components and then update the state afterwards
        return updateStateAndComponentMap(
            unlistenedComponentHandles,
            this._dataProps.fluidComponentMap,
            loadFromRoot,
            this._syncedStateId,
            this._root,
            this._dataProps.runtime,
            this.state,
            this._setStateFromRoot.bind(this),
            this._initialFluidState,
            rootCallback,
            this._viewToFluid,
            this._fluidToView,
        ).then(() => this._deferredInitP.resolve());
    }

    /**
     * Function to update the state from both root updates or local ones. Only updates the root
     * on local updates
     * @param newState - the new state to be set
     * @param fromRootUpdate - is this update coming locally or from a synced root value change
     */
    private _setStateFromRoot(newState: SV, fromRootUpdate?: boolean, isLocal?: boolean) {
        if (!this._deferredInitP.isCompleted) {
            this._initQueue = this._initQueue.then(() => this._setStateFromRoot(newState, fromRootUpdate, isLocal));
            return;
        }
        if (isLocal) {
            super.setState(newState);
        } else if (fromRootUpdate) {
            const fluidState = getFluidStateFromRoot(
                this._syncedStateId,
                this._root,
                this._dataProps.fluidComponentMap,
                this._initialFluidState,
                this._fluidToView,
            );
            syncStateAndRoot(
                true,
                this._syncedStateId,
                this._root,
                this._dataProps.runtime,
                newState,
                this._setStateFromRoot.bind(this),
                this._dataProps.fluidComponentMap,
                fluidState,
                this._viewToFluid,
                this._fluidToView,
            );
        } else {
            this.setState(newState);
        }
    }

    /**
     * Function to update the current state. It overloads the React component setState function
     * @param newState - New state to be set both locally and on the synced root
     */
    public setState(newState: SV) {
        if (!this._deferredInitP.isCompleted) {
            this._initQueue = this._initQueue.then(() => this.setState(newState));
            return;
        }
        const fluidState = getFluidStateFromRoot(
            this._syncedStateId,
            this._root,
            this._dataProps.fluidComponentMap,
            this._initialFluidState,
            this._fluidToView,
        );
        syncStateAndRoot(
            false,
            this._syncedStateId,
            this._root,
            this._dataProps.runtime,
            newState,
            this._setStateFromRoot.bind(this),
            this._dataProps.fluidComponentMap,
            fluidState,
            this._viewToFluid,
            this._fluidToView,
        );
    }
}
