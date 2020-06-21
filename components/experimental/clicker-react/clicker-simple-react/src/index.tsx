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
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    ICounterState,
    primitiveFluidToView,
} from "@fluid-example/clicker-common";

// A Clicker example that does not use any specific DDS

export class Clicker extends SyncedComponent implements IComponentHTMLView {
    constructor(props) {
        super(props);
        // Define the value on the synced state so that it is registered for synced
        // React view updates on all clients.
        this.syncedStateConfig.set(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView: primitiveFluidToView,
                defaultViewState: { value: 0 },
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

class CounterReactView extends UnifiedReactComponent<ICounterState> {
    render() {
        return (
            <div>
                <span>
                    {this.state.value}
                </span>
                <button onClick={() => { this.setState({ value: this.state.value + 1 }); }}>+</button>
            </div>
        );
    }
}

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    "clicker-simple-react",
    Clicker,
    [],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
