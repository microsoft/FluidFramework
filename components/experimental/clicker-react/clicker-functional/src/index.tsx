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

import { CounterReactFunctional } from "./view";

export class Clicker extends SyncedComponent {
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "counter-functional",
            {
                syncedStateId: "counter-functional",
                fluidToView: ddsToPrimitiveFluidToView,
                viewToFluid: primitiveToDdsViewToFluid,
                defaultViewState: { value: 0 },
            },
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunctional
                    syncedStateId={"counter-functional"}
                    syncedComponent={this}
                />
            </div>,
            div,
        );
        return div;
    }
}

export const ClickerFactory = new PrimedComponentFactory(
    "clicker-functional",
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerFactory;
