/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent } from "@fluidframework/react";
import { ddsToPrimitiveFluidToView, primitiveToDdsViewToFluid } from "@fluid-example/clicker-common";
import { SharedCounter } from "@fluidframework/counter";

import { CounterReactView } from "./view";

/**
 * Clicker example that uses a SharedCounter as its DDS but never expose it to the view
 */
export class Clicker extends SyncedComponent {
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView: ddsToPrimitiveFluidToView,
                viewToFluid: primitiveToDdsViewToFluid,
                defaultViewState: { value: 0 },
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
    "clicker-react-impure",
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
