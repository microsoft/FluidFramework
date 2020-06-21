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

import { Container } from "./container";

/**
 * Clicker example that uses SyncedComponent to fill the value of a PrimedContext. The view itself does not have
 * any Fluid references, even though it is powered using a SharedCounter
 */
export class Clicker extends SyncedComponent {
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "counter-context",
            {
                syncedStateId: "counter-context",
                fluidToView: ddsToPrimitiveFluidToView,
                viewToFluid: primitiveToDdsViewToFluid ,
                defaultViewState: { value: 0 },
            },
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
                <Container
                    syncedStateId={"counter-context"}
                    syncedComponent={this}
                />,
            div,
        );
        return div;
    }
}

export const ClickerFactory = new PrimedComponentFactory(
    "clicker-context",
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerFactory;
