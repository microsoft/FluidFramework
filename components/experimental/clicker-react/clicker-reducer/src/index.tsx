/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent } from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import {
    ClickerReducer,
    ddsFluidToView,
    ddsViewToFluid,
} from "@fluid-example/clicker-common";
import { CounterReactFunctionalReducer } from "./view";

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends SyncedComponent {
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "counter-reducer",
            {
                syncedStateId: "counter-reducer",
                fluidToView: ddsFluidToView,
                viewToFluid: ddsViewToFluid,
                defaultViewState: { value: 0 },
            },
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunctionalReducer
                    syncedStateId={"counter-reducer"}
                    syncedComponent={this}
                    reducer={ClickerReducer}
                    selector={{}}
                />
            </div>,
            div,
        );
        return div;
    }
}

export const ClickerWithHooksInstantiationFactory = new PrimedComponentFactory(
    "clicker-reducer",
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHooksInstantiationFactory;
