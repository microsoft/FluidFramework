/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    IFluidProps,
    IFluidState,
    IViewState,
    IFluidConverter,
    IViewConverter,
    IFluidDataProps,
    ISyncedState,
} from "./interface";
import { syncState, initializeState } from "./helpers";

/**
 * A React view with a synced state, initial props, and a Fluid-to-view state two-way mapping
 */
export abstract class FluidReactView<SV extends IViewState,
    SF extends IFluidState> extends React.Component<IFluidProps<SV, SF>, SV> {
    private readonly _syncedStateId: string;
    private readonly _syncedState: ISyncedState;
    private readonly _dataProps: IFluidDataProps;
    private readonly _viewToFluid: Map<keyof SV, IFluidConverter<SV, SF>>;
    private readonly _fluidToView: Map<keyof SF, IViewConverter<SV, SF>>;
    constructor(props: IFluidProps<SV, SF>) {
        super(props);
        const {
            syncedStateId,
            syncedDataObject,
        } = props;
        const config = syncedDataObject.getConfig(syncedStateId);
        if (config === undefined) {
            throw Error(`Failed to find configuration for synced state ID: ${syncedStateId}`);
        }
        this._viewToFluid = config.viewToFluid as any;
        this._fluidToView = config.fluidToView as any;
        this._syncedStateId = syncedStateId;
        this._syncedState = syncedDataObject.syncedState;
        this._dataProps = syncedDataObject.dataProps;
        this.state = config.defaultViewState;
    }

    public async componentDidMount() {
        await initializeState(
            this._syncedStateId,
            this._syncedState,
            this._dataProps,
            this.state,
            this._setState.bind(this),
            this._fluidToView,
            this._viewToFluid,
        );
    }

    /**
     * Function to update the state from both synced state updates or local ones. Only updates the synced state
     * on local updates
     * @param newState - the new state to be set
     * @param fromRootUpdate - is this update coming locally or from a synced state value change
     * @param isLocal - should this update be applied only locally
     */
    private _setState(
        newState: SV,
        fromRootUpdate?: boolean,
        isLocal?: boolean,
    ) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (isLocal) {
            super.setState(newState);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        } else if (fromRootUpdate) {
            syncState(
                true,
                this._syncedStateId,
                this._syncedState,
                this._dataProps.runtime,
                newState,
                this._setState.bind(this),
                this._dataProps.fluidObjectMap,
                this._fluidToView,
                this._viewToFluid,
            );
        } else {
            this.setState(newState);
        }
    }

    /**
     * Function to update the current state. It overloads the React setState function
     * @param newState - New state to be set both locally and on the synced state
     */
    public setState(newState: SV) {
        syncState(
            false,
            this._syncedStateId,
            this._syncedState,
            this._dataProps.runtime,
            newState,
            this._setState.bind(this),
            this._dataProps.fluidObjectMap,
            this._fluidToView,
            this._viewToFluid,
        );
    }
}
