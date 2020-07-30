/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    SyncedComponent,
    setSyncedCounterConfig,
    useSyncedCounter,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";
import * as ReactDOM from "react-dom";

// ---- React Functional Component w/ useSyncedCounter ----

interface ICounterReactHookProps {
    syncedComponent: SyncedComponent,
    syncedStateId: string,
}

function CounterWithHook(
    props: ICounterReactHookProps,
) {
    const [value, reducer] = useSyncedCounter(
        props.syncedComponent,
        props.syncedStateId,
    );

    return (
        <div>
            <span className="value">
                {value}
            </span>
            <button onClick={() => reducer.increment(1)}>
                +
            </button>
        </div>
    );
}

/**
 * ClickerWithHook example using the useSyncedCounter hook
 */
export class ClickerWithHook extends SyncedComponent {
    constructor(props) {
        super(props);
        setSyncedCounterConfig(this, "counter-with-hook");
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterWithHook
                    syncedComponent={this}
                    syncedStateId={"counter-with-hook"}
                />
            </div>,
            div,
        );
        return div;
    }
}

// ----- FACTORY SETUP -----
export const ClickerWithHookInstantiationFactory = new DataObjectFactory(
    "clicker-with-hook",
    ClickerWithHook,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHookInstantiationFactory;
