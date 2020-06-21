/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    UnifiedReactComponent,
    SyncedComponent,
} from "@fluidframework/react";
import {
    ICounterFluidState,
    fluidToView,
} from "@fluid-example/clicker-common";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * Clicker example that uses a SharedCounter as its DDS
 */
export class Clicker extends SyncedComponent implements IComponentHTMLView {
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView,
                defaultViewState: {},
            },
        );
    }

    public get IComponentHTMLView() { return this; }

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

class CounterReactView extends UnifiedReactComponent<ICounterFluidState> {
    render() {
        return (
            <div>
                <span>
                    {this.state.counter?.value}
                </span>
                <button onClick={() => { this.state.counter?.increment(1); }}>+</button>
            </div>
        );
    }
}

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    "clicker-counter",
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
