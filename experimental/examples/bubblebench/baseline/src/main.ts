/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";

import { AppState } from "./state";

export class Bubblebench extends DataObject {
    public static get Name() { return "@fluid-example/bubblebench-baseline"; }
    private state?: AppState;

    protected async hasInitialized() {
        this.state = new AppState(
            /* stageWidth: */ 640,
            /* stageHeight: */ 480,
            /* numBubbles: */ 1,
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    public get clientManager() { return this.state!; }
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
