/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { ISharedDirectory, ISharedMap } from "@fluidframework/map";
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
    private readonly viewToFluid?: Map<keyof SV, IFluidConverter<SV,SF>>;
    private readonly fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>;
    private readonly _initialFluidState: SF;
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
        this.viewToFluid = viewToFluid;
        this.fluidToView = fluidToView;
        this._syncedStateId = syncedStateId;
        this._root = root;
        this._dataProps = dataProps;
        this._initialFluidState = initialFluidState;
        let componentSchemaHandles = getComponentSchemaFromRoot(this._syncedStateId, root);
        // If the stored schema is undefined on this root, i.e. it is the first time this
        // component is being loaded, generate it and store it
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
        dataProps.fluidComponentMap.forEach((value: IFluidComponent, k) => {
            if (!value.isListened && value.component?.handle !== undefined) {
                unlistenedComponentHandles.push(value.component.handle);
            }
        });

        // Define the root callback listener that will be responsible for triggering state updates on root value changes
        const rootCallback = rootCallbackListener(
            dataProps.fluidComponentMap,
            this._syncedStateId,
            root,
            dataProps.runtime,
            this.state,
            this._setStateFromRoot.bind(this),
            { ...this._initialFluidState },
            viewToFluid,
            fluidToView,
        );

        // Check if there is a synced state value already stored, i.e. if the component has been loaded before
        let loadFromRoot = true;
        const storedFluidStateHandle = root.get(`syncedState-${syncedStateId}`);
        if (storedFluidStateHandle === undefined) {
            loadFromRoot = false;
            const syncedStateHandle = setFluidStateToRoot(
                this._syncedStateId,
                root,
                dataProps.runtime,
                dataProps.fluidComponentMap,
                initialFluidState,
                fluidToView,
            );
            unlistenedComponentHandles.push(syncedStateHandle);
            unlistenedMapHandles.push(syncedStateHandle);
        } else {
            unlistenedComponentHandles.push(storedFluidStateHandle);
            unlistenedMapHandles.push(storedFluidStateHandle);
        }

        // Initialize the FluidComponentMap with our data handles
        for (const handle of unlistenedMapHandles) {
            dataProps.fluidComponentMap.set(handle.path, {
                isListened: false,
                isRuntimeMap: true,
            });
        }

        // Add the callback to the component's own root
        root.on("valueChanged", rootCallback);

        // Add the callback to all the unlistened components and then update the state afterwards
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        updateStateAndComponentMap(
            unlistenedComponentHandles,
            dataProps.fluidComponentMap,
            loadFromRoot,
            this._syncedStateId,
            root,
            dataProps.runtime,
            this.state,
            this._setStateFromRoot.bind(this),
            this._initialFluidState,
            rootCallback,
            viewToFluid,
            fluidToView,
        );
    }

    /**
     * Function to update the state from both root updates or local ones. Only updates the root
     * on local updates
     * @param newState - the new state to be set
     * @param fromRootUpdate - is this update coming locally or from a synced root value change
     */
    private _setStateFromRoot(newState: SV, fromRootUpdate?: boolean, isLocal?: boolean) {
        if (isLocal) {
            super.setState(newState);
        } else if (fromRootUpdate) {
            const fluidState = getFluidStateFromRoot(
                this._syncedStateId,
                this._root,
                this._dataProps.fluidComponentMap,
                this._initialFluidState,
                this.fluidToView,
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
                this.viewToFluid,
                this.fluidToView,
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
        const fluidState = getFluidStateFromRoot(
            this._syncedStateId,
            this._root,
            this._dataProps.fluidComponentMap,
            this._initialFluidState,
            this.fluidToView,
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
            this.viewToFluid,
            this.fluidToView,
        );
    }
}
