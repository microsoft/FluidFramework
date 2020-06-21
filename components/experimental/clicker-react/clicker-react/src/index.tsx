/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent } from "@fluidframework/react";
import { ddsFluidToView } from "@fluid-example/clicker-common";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { CounterReactView } from "./view";

/**
 * Clicker example that uses a SharedCounter as its DDS
 */
export class Clicker extends SyncedComponent {
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView: ddsFluidToView,
                defaultViewState: {},
            },
        );
    }

    public render(element: HTMLElement) {
        ReactDOM.render(
            <CounterReactView
                syncedStateId={"clicker"}
                syncedComponent={this}
            />,
            element,
        );
        return element;
    }
}

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    "clicker-counter",
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
