/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";
import { AppView } from "@fluid-experimental/bubblebench-common";
import { AppState } from "./state";

export class Bubblebench extends DataObject implements IFluidHTMLView {
    public static get Name() { return "@fluid-experimental/bubblebench-baseline"; }
    private state?: AppState;
    public get IFluidHTMLView() { return this; }

    protected async hasInitialized() {
        this.state = new AppState(
            /* stageWidth: */ 640,
            /* stageHeight: */ 480,
            /* numBubbles: */ 1,
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(<AppView app={this.clientManager}></AppView>, div);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    private get clientManager() { return this.state!; }
}

/**
 * The DataObjectFactory declares the Fluid object and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const BubblebenchInstantiationFactory = new DataObjectFactory(
    Bubblebench.Name,
    Bubblebench,
    [],
    {},
);
