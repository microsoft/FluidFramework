/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedMap } from "@fluidframework/map";
import {
    IFluidProps,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IFluidConverter,
    IViewConverter,
    IFluidDataProps,
} from "./interface";
import { syncStateAndRoot, initializeState } from "./helpers";

/**
 * A react component with a root, initial props, and a root to state mapping
 */
export abstract class FluidReactComponent<SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState> extends React.Component<IFluidProps<SV, SF>, SV> {
    private readonly _syncedStateId: string;
    private readonly _root: ISharedMap;
    private readonly _dataProps: IFluidDataProps;
    private readonly _viewToFluid: Map<keyof SV, IFluidConverter<SV, SF>>;
    private readonly _fluidToView: Map<keyof SF, IViewConverter<SV, SF>>;
    constructor(props: IFluidProps<SV, SF>) {
        super(props);
        const {
            syncedStateId,
            syncedComponent,
        } = props;
        const config = syncedComponent.syncedStateConfig.get(syncedStateId);
        if (config === undefined) {
            throw Error(`Failed to find configuration for synced state ID: ${syncedStateId}`);
        }
        this._viewToFluid = config.viewToFluid as any;
        this._fluidToView = config.fluidToView as any;
        this._syncedStateId = syncedStateId;
        this._root = syncedComponent.syncedState;
        this._dataProps = syncedComponent.dataProps;
    }

    public async componentDidMount() {
        await initializeState(
            this._syncedStateId,
            this._root,
            this._dataProps,
            this.state,
            this._setStateFromRoot.bind(this),
            this._fluidToView,
            this._viewToFluid,
        );
    }

    /**
     * Function to update the state from both root updates or local ones. Only updates the root
     * on local updates
     * @param newState - the new state to be set
     * @param fromRootUpdate - is this update coming locally or from a synced root value change
     * @param isLocal - should this update be applied only locally
     */
    private _setStateFromRoot(
        newState: SV,
        fromRootUpdate?: boolean,
        isLocal?: boolean,
    ) {
        if (isLocal) {
            super.setState(newState);
        } else if (fromRootUpdate) {
            syncStateAndRoot(
                true,
                this._syncedStateId,
                this._root,
                this._dataProps.runtime,
                newState,
                this._setStateFromRoot.bind(this),
                this._dataProps.fluidComponentMap,
                this._fluidToView,
                this._viewToFluid,
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
        syncStateAndRoot(
            false,
            this._syncedStateId,
            this._root,
            this._dataProps.runtime,
            newState,
            this._setStateFromRoot.bind(this),
            this._dataProps.fluidComponentMap,
            this._fluidToView,
            this._viewToFluid,
        );
    }
}
