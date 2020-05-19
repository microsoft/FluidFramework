/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-floating-promises */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";
import {
    FluidProps,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IRootConverter,
    IViewConverter,
    FluidComponentMap,
} from "./interface";
import { rootCallbackListener, syncStateAndRoot } from "./updateStateAndComponentMap";

/**
 * A react component with a root, initial props, and a root to state mapping
 */
export abstract class FluidReactComponent<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> extends React.Component<FluidProps<SV,SF>, SV> {
    private readonly _root: ISharedDirectory;
    private readonly viewToFluid?: Map<keyof SV, IRootConverter<SV,SF>>;
    private readonly fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>;
    private readonly fluidComponentMap?: FluidComponentMap;
    constructor(
        props: FluidProps<SV,SF>,
    ) {
        super(props);
        const {
            fluidToView,
            viewToFluid,
            root,
            initialViewState,
            initialFluidState,
            fluidComponentMap,
        } = props;

        this.state = initialViewState;
        this.viewToFluid = viewToFluid;
        this.fluidToView = fluidToView;
        this.fluidComponentMap = fluidComponentMap;
        this._root = root;
        if (root.get("syncedState") === undefined) {
            root.set("syncedState", initialFluidState);
        }
        const rootCallback = rootCallbackListener(
            fluidComponentMap,
            true,
            root,
            this.state,
            this._setStateFromRoot.bind(this),
            viewToFluid,
            fluidToView,
        );
        root.on("valueChanged", rootCallback);
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
