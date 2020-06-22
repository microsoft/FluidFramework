/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent } from "@fluidframework/react";
import {
    ClickerReducer,
    ddsFluidToView,
    ddsViewToFluid,
} from "@fluid-example/clicker-common";
import { SharedCounter } from "@fluidframework/counter";
import { Container } from "./container";

/**
 * Clicker example that uses SyncedComponent to fill the value of a PrimedContext. The view itself does not have
 * any Fluid references, even though it is powered using a SharedCounter. This is achieved using the useReducerFluid
 * hook in conjunction with React's own createContext and useContext
 */
export class Clicker extends SyncedComponent {
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "counter-context",
            {
                syncedStateId: "counter-context",
                fluidToView:  ddsFluidToView,
                viewToFluid: ddsViewToFluid,
                defaultViewState: { value: 0 },
            },
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
                <Container
                    syncedStateId={"counter-context"}
                    syncedComponent={this}
                    reducer={ClickerReducer}
                    selector={{}}
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
