/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent } from "@fluidframework/react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { CounterReactView } from "./view";

// A Clicker example that does not use any specific DDS and just applies primitives on a SharedMap to sync state
// WARNING:
// Setting primitives should only be done for values that do not require time-sensitive synchronicity
// For any values that users might be interacting with simultaneously, please use SharedObjects in your state
// i.e. for clicker, use a SharedCounter; for strings, use SharedString; etc.
// To see how to do this, please read the clicker-react and clicker-react-nonunified examples

export class Clicker extends SyncedComponent {
    constructor(props) {
        super(props);
        // Define the value on the synced state so that it is registered for synced
        // React view updates on all clients.
        this.syncedStateConfig.set(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView: new Map([
                    [
                        "value", {
                            type: "number",
                            viewKey: "value",
                        },
                    ],
                ]),
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
    "clicker-simple-react",
    Clicker,
    [],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
