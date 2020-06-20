/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    SimpleReactComponent,
    IFluidReactState,
    SyncedComponent,
} from "@fluidframework/react";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

export class Clicker extends SyncedComponent implements IComponentHTMLView {
    constructor(props) {
        super(props);
        this.syncedStateConfig.set(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView: new Map([
                    [
                        "value", {
                            type:  "number",
                            viewKey: "value",
                        },
                    ],
                ]),
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

interface CounterState extends IFluidReactState {
    value: number;
}

class CounterReactView extends SimpleReactComponent<CounterState> {
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
